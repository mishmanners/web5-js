import { expect } from 'chai';

import * as testProfile from './fixtures/test-profiles.js';

import { VcApi } from '../src/vc-api.js';
import { TestAgent, TestProfileOptions } from './test-utils/test-user-agent.js';

// import jwt from 'jsonwebtoken';

let did: string;
let vcApi: VcApi;
let testAgent;
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

  describe('verifiable credentials send to ssi', () => {
    describe('create', () => {
      it('SSI-verifiable VC', async () => {
        const credentialSubject = {firstName: 'alice'};
        const result = await vcApi.create(credentialSubject);
        expect(result.status.code).to.equal(202);
        expect(result.status.detail).to.equal('Accepted');
        expect(result.record).to.exist;

        let ssiResponse = await fetch('https://ssi.tbddev.org/v1/credentials/verification',
          {
            method: 'PUT',

            body: JSON.stringify({
              'credentialJwt': await result.record?.data.text(),
            }),
          }
        );

        let ssiVerified = await ssiResponse.json();

        console.log(ssiVerified);

        expect(ssiVerified.verified).to.be.true;
      });

    });
  });
});