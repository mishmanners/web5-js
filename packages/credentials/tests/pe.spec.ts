import { webcrypto } from 'node:crypto';

import { expect } from 'chai';
import { Encoder } from '@tbd54566975/dwn-sdk-js';
import { sha256 } from '@noble/hashes/sha256';
import { Web5 } from '@tbd54566975/web5';
import * as secp256k1 from '@noble/secp256k1';

import { PresentationDefinition, PresentationResult, VerifiableCredential, evaluateCredentials, evaluatePresentation, presentationFrom } from '../src/types.js';
import * as testProfile from '../../web5/tests/fixtures/test-profiles.js';
import { TestAgent } from '../../web5/tests/test-utils/test-user-agent.js';

import { SignatureInput } from '@tbd54566975/dwn-sdk-js';

// NOTE: @noble/secp256k1 requires globalThis.crypto polyfill for node.js <=18: https://github.com/paulmillr/noble-secp256k1/blob/main/README.md#usage
// Remove when we move off of node.js v18 to v20, earliest possible time would be Oct 2023: https://github.com/nodejs/release#release-schedule
// @ts-ignore
if (!globalThis.crypto) globalThis.crypto = webcrypto;

let testAgent: TestAgent;

describe('PresentationExchange', () => {
  before(async () => {
    testAgent = await TestAgent.create();
  });

  it('does a full presentation exchange', async () => {
    const { web5, did: aliceDid } = await Web5.connect();
    const aliceSignatureMaterial = await getSignatureMaterial(web5, aliceDid);

    const btcCredential: VerifiableCredential =  {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
      ],
      'id'                : 'btc-credential',
      'type'              : ['VerifiableCredential'],
      'issuer'            : aliceDid,
      'issuanceDate'      : new Date().toISOString(),
      'credentialSubject' : {
        'btcAddress': 'btcAddress123'
      }
    };

    const btcCredentialJwt = await createJwt({
      payload           : { vc: btcCredential },
      issuer            : aliceDid,
      subject           : aliceDid,
      signatureMaterial : aliceSignatureMaterial as any
    });

    const presentationDefinition: PresentationDefinition = {
      'id'                : 'test-pd-id',
      'name'              : 'simple PD',
      'purpose'           : 'pd for testing',
      'input_descriptors' : [
        {
          'id'          : 'whatever',
          'purpose'     : 'id for testing',
          'constraints' : {
            'fields': [
              {
                'path': [
                  '$.credentialSubject.btcAddress',
                ]
              }
            ]
          }
        }
      ]
    };

    const evaluationResults = evaluateCredentials(presentationDefinition, [btcCredentialJwt]);

    expect(evaluationResults.errors).to.be.an('array');
    expect(evaluationResults.errors?.length).to.equal(0);

    const presentationResult: PresentationResult = presentationFrom(presentationDefinition, [btcCredentialJwt]);

    const vpJwt = await createJwt({
      payload           : { vp: presentationResult.presentation },
      issuer            : aliceDid,
      subject           : aliceDid,
      signatureMaterial : aliceSignatureMaterial as any
    });

    const presentation = decodeJwt(vpJwt).payload.vp;

    const { warnings, errors } = evaluatePresentation(presentationDefinition,  presentation );

    expect(errors).to.be.an('array');
    expect(errors?.length).to.equal(0);

    expect(warnings).to.be.an('array');
    expect(warnings?.length).to.equal(0);
  });
});

function decodeJwt(jwt) {
  const [encodedHeader, encodedPayload, encodedSignature] = jwt.split('.');

  return {
    header  : Encoder.base64UrlToObject(encodedHeader),
    payload : Encoder.base64UrlToObject(encodedPayload),
    encodedSignature
  };
}

type CreateJwtOpts = {
  payload: any,
  subject: string
  issuer: string
  signatureMaterial: SignatureInput
}

export async function createJwt(opts: CreateJwtOpts) {
  const jwtPayload = {
    iss : opts.issuer,
    sub : opts.subject,
    ...opts.payload,
  };

  const signatureMaterial = opts.signatureMaterial;

  const payloadBytes = Encoder.objectToBytes(jwtPayload);
  const payloadBase64url = Encoder.bytesToBase64Url(payloadBytes);

  const headerBytes = Encoder.objectToBytes(signatureMaterial.protectedHeader);
  const headerBase64url = Encoder.bytesToBase64Url(headerBytes);

  const signatureInput = `${headerBase64url}.${payloadBase64url}`;
  const signatureInputBytes = Encoder.stringToBytes(signatureInput);

  const hashedSignatureInputBytes = sha256(signatureInputBytes);
  const hashedSignatureInputHex = secp256k1.etc.bytesToHex(hashedSignatureInputBytes);

  const privateKeyBytes = Encoder.base64UrlToBytes(signatureMaterial.privateJwk.d);
  const privateKeyHex = secp256k1.etc.bytesToHex(privateKeyBytes);

  const signature = await secp256k1.signAsync(hashedSignatureInputHex, privateKeyHex);
  const signatureBytes = signature.toCompactRawBytes();
  const signatureBase64url = Encoder.bytesToBase64Url(signatureBytes);

  return `${headerBase64url}.${payloadBase64url}.${signatureBase64url}`;
}


async function getSignatureMaterial(web5, did) {
  const testProfileOptions = await testProfile.ion.with.dwn.service.and.authorization.keys();
  ({ did } = await testAgent.createProfile(testProfileOptions));

  const profile = await testAgent.getProfile(did);

  if (!profile) {
    throw new Error('profile not found for author.');
  }

  const { keys } = profile.did;
  const [ key ] = keys;
  const { privateKeyJwk } = key;

  // const kidFragment = privateKeyJwk.kid || key.id;
  // const kid = `${profile.did.id}#${kidFragment}`;
  const kid = key.id;

  const dwnSignatureInput = {
    privateJwk      : privateKeyJwk,
    protectedHeader : { alg: privateKeyJwk.crv, kid, typ: 'JWT' }
  };

  return dwnSignatureInput;
}