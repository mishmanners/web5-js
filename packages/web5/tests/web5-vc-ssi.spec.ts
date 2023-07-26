import { expect } from 'chai';

import * as testProfile from './fixtures/test-profiles.js';

import { VcApi } from '../src/vc-api.js';
import { TestAgent, TestProfileOptions } from './test-utils/test-user-agent.js';

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
        const credentialSubject = {firstName: 'alice'};
        const result = await vcApi.create(credentialSubject);
        expect(result.status.code).to.equal(202);
        expect(result.status.detail).to.equal('Accepted');
        expect(result.record).to.exist;

        console.log('created vc, verifiying it against SSI');

        let ssiResponse = await loggableFetch(SSIBaseURL + '/v1/credentials/verification', {
          method : 'PUT',
          body   : JSON.stringify({'credentialJwt': await result.record?.data.text()}),
        });

        let ssiVerified = await ssiResponse.json();

        console.log(ssiVerified);

        expect(ssiVerified.verified).to.be.true;
      });
    });
  });
});

function loggableFetch(url: string, init?: RequestInit | undefined): Promise<Response> {
  let method = init?.method || 'GET';
  console.log(method, ' ', url);
  return fetch(url, init);
}