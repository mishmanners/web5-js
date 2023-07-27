import { expect } from 'chai';

import * as testProfile from './fixtures/test-profiles.js';

import { VcApi } from '../src/vc-api.js';
import { TestAgent, TestProfileOptions } from './test-utils/test-user-agent.js';
import { DidKeyApi } from '@tbd54566975/dids';


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

        console.log('creating vc');
        const credentialSubject = { firstName: 'alice' };
        const result = await vcApi.create(credentialSubject);
        expect(result.status.code).to.equal(202);
        expect(result.status.detail).to.equal('Accepted');
        expect(result.record).to.exist;

        console.log('created vc, verifiying it against SSI');

        let ssiResponse = await ssiRequest('/v1/credentials/verification', {
          'credentialJwt': await result.record?.data.text(),
        });

        console.log(ssiResponse);

        expect(ssiResponse.verified).to.be.true;
      });
      it('a presentation exchange', async () => {
        const issuerDID = await ssiRequest('/v1/dids/key', {keyType: 'Ed25519'});
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

        const submissionJWTData = {
          vp: {
            '@context': [
              'https://www.w3.org/2018/credentials/v1'
            ],
            holder                  : holderDID.id, // go test calls holderDID.Expand() then this is .ID on the result of that. Have not investigated.
            type                    : ['VerifiablePresentation'],
            presentation_submission : {
              id             : '{{.SubmissionID}}', // uuid.NewString()
              definition_id  : '{{.DefinitionID}}', // PUT /v1/presentations/definitions -> DefinitionID = .presentation_definition.id
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

        const submissionJWT = JSON.stringify(submissionJWTData); // TODO make + sign a JWT out of this data, don't just JSON-encode it
        let createSubmissionResponse = await ssiRequest('/v1/presentations/submissions', {submissionJwt: submissionJWT});

        expect(createSubmissionResponse.done).to.be.true;
      });
    });
  });
});

async function ssiRequest(path: string, body?: any): Promise<any> {
  const method = body ? 'PUT' : 'GET'; // method is PUT if a request body is provided, GET if not
  const url = SSIBaseURL + path;

  if(process.env.LOG_SSI_REQUESTS) {
    console.log('>', method, url, body);
  }

  const init: RequestInit = {method: method};
  if(body) {
    init.body = JSON.stringify(body);
  }

  const resp = await fetch(url, init);
  const respJSON = await resp.json();

  if(process.env.LOG_SSI_REQUESTS) {
    console.log('<', resp.status, resp.statusText, ': ', respJSON);
  }

  return respJSON;
}