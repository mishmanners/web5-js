import { expect } from 'chai';

import * as testProfile from './fixtures/test-profiles.js';

import { VcApi } from '../src/vc-api.js';
import { TestAgent, TestProfileOptions } from './test-utils/test-user-agent.js';
import { DidKeyApi } from '../../dids/src/did-key.js';
import * as jose from 'jose';

// import jwt from 'jsonwebtoken';

// set environment variable SSI_BASE_URL=http://localhost:8080 for local testing
let SSIBaseURL = process.env.SSI_BASE_URL || 'https://ssi.tbddev.org';

let did: string;
let vcApi: VcApi;
let testAgent: TestAgent;
let testProfileOptions: TestProfileOptions;

describe('web5.vc.ssi', () => {
  before(async () => {
    testAgent = await TestAgent.create();
  });

  beforeEach(async () => {
    await testAgent.clearStorage();

    testProfileOptions = await testProfile.ion.with.dwn.service.and.authorization.keys();
    ({ did } = await testAgent.createProfile(testProfileOptions));

    vcApi = new VcApi(testAgent.agent, did);
  });

  after(async () => {
    await testAgent.clearStorage();
    await testAgent.closeStorage();
  });

  describe('validated against ssi', () => {
    describe('create and validate', () => {
      it('a verifiable credential', async () => {

        const credentialSubject = { firstName: 'alice' };
        const result = await vcApi.create(credentialSubject);
        expect(result.status.code).to.equal(202);
        expect(result.status.detail).to.equal('Accepted');
        expect(result.record).to.exist;

        console.log('created vc, verifiying it against SSI');

        let ssiResponse = await ssiRequest('/v1/credentials/verification', {
          'credentialJwt': await result.record?.data.text(),
        });

        expect(ssiResponse.verified).to.be.true;
      });
      it('a presentation exchange', async () => {
        const issuerDID = await ssiRequest('/v1/dids/key', { keyType: 'Ed25519' });
        const holderDID = await new DidKeyApi().create();

        let credentialResponse = await ssiRequest('/v1/credentials', {
          data: {
            additionalName : 'Mclovin',
            dateOfBirth    : '1987-01-02',
            familyName     : 'Andres',
            givenName      : 'Uribe'
          },
          issuer               : issuerDID.did.id,
          verificationMethodId : issuerDID.did.verificationMethod[0].id,
          subject              : holderDID.id,
          expiry               : '2051-10-05T14:48:00.000Z'
        });

        let presentationDefinition = await ssiRequest('/v1/presentations/definitions', {
          name             : 'name',
          purpose          : 'purpose',
          inputDescriptors : [
            {
              id          : 'wa_driver_license',
              name        : 'washington state business license',
              purpose     : 'some testing stuff',
              constraints : {
                fields: [
                  {
                    id   : 'date_of_birth',
                    path : [
                      '$.credentialSubject.dateOfBirth',
                      '$.credentialSubject.dob',
                      '$.vc.credentialSubject.dateOfBirth',
                      '$.vc.credentialSubject.dob'
                    ]
                  }
                ]
              }
            }
          ]
        });

        const submissionJWTData = {
          vp: {
            '@context': [
              'https://www.w3.org/2018/credentials/v1'
            ],
            holder                  : holderDID.id, // go test calls holderDID.Expand() then this is .ID on the result of that. Have not investigated.
            type                    : ['VerifiablePresentation'],
            presentation_submission : {
              id             : 'D1C7DF4A-BE63-480E-9B0D-2354B11E06B0', // TODO: generate a new UUID here for every run
              definition_id  : presentationDefinition.presentation_definition.id,
              descriptor_map : [
                {
                  id     : 'wa_driver_license',
                  format : 'jwt_vp',
                  path   : '$.verifiableCredential[0]'
                }
              ]
            },
            verifiableCredential: [credentialResponse.credentialJwt]
          }
        };

        console.log(holderDID);

        // this doesn't work, I don't know why
        // sample privateKeyJwk value:
        // {
        //   kty: 'OKP',
        //   crv: 'Ed25519',
        //   kid: 'z6MkmucRVk9DWAuKvpoHn2CS67pKCoXe6C67SQmFridfWFUR',
        //   x: 'bsHzXIp3Rw9T6gI8WqUC-Twkv182r8VnDBVfz_66PFY',
        //   d: 'JyUViu5gqxnVfQSdKDYHIPY6WMpvL2Usz5UNsby0JIpuwfNcindHD1PqAjxapQL5PCS_XzavxWcMFV_P_ro8Vg'
        // }
        //
        // docs for importJWK: https://github.com/panva/jose/blob/main/docs/functions/key_import.importJWK.md
        // {
        //   crv: 'P-256',
        //   kty: 'EC',
        //   x: 'ySK38C1jBdLwDsNWKzzBHqKYEE5Cgv-qjWvorUXk9fw',
        //   y: '_LeQBw07cf5t57Iavn4j-BqJsAD1dpoz8gokd3sBsOo',
        // }
        let jwk: jose.KeyLike | Uint8Array | undefined;
        for(const key of holderDID.keys) {
          try {
            console.log('attempting to import jwk:', key);
            jwk = await jose.importJWK(key.privateKeyJwk);
            break;
          } catch(e) {
            console.error('failed to import jwk:', e);
          }
        }
        if(!jwk) {
          throw 'failed to import any keys';
        }

        const submissionJWT = await new jose.SignJWT(submissionJWTData)
          .setProtectedHeader({ alg: 'ED25519', kid: holderDID.id + issuerDID.did.verificationMethod[0].id, typ: 'JWT' })
          .setIssuedAt(Math.floor(Date.now() / 1000))
          .setIssuer(holderDID.id)
          .setExpirationTime('2y')
          .sign(jwk);

        let createSubmissionResponse = await ssiRequest('/v1/presentations/submissions', { submissionJwt: submissionJWT });

        expect(createSubmissionResponse.done).to.be.true;
      });
    });
  });
});

async function ssiRequest(path: string, body?: any): Promise<any> {
  const method = body ? 'PUT' : 'GET'; // method is PUT if a request body is provided, GET if not
  const url = SSIBaseURL + path;

  if (process.env.LOG_SSI_REQUESTS) {
    console.log('>', method, url, body);
  }

  const init: RequestInit = { method: method };
  if (body) {
    init.body = JSON.stringify(body);
  }

  const resp = await fetch(url, init);
  const respJSON = await resp.json();

  if (process.env.LOG_SSI_REQUESTS) {
    console.log('<', resp.status, resp.statusText, ': ', respJSON);
  }

  if (resp.status > 299) {
    throw method + ' to ' + url + ' returned ' + resp.status + ' ' + resp.statusText;
  }

  return respJSON;
}