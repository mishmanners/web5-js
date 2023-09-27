import { Request, Response } from 'express';
import type { ICredential } from '@sphereon/ssi-types'
import { VcJwt, VerifiableCredential, SignOptions } from '../packages/credentials/src/index.js';
import { DidKeyMethod, PortableDid } from '../packages/dids/src/index.js';
import { Ed25519, Jose } from '../packages/crypto/src/index.js';

type Signer = (data: Uint8Array) => Promise<Uint8Array>;

class IssueCredentialBody {
    credential: ICredential
    options: IssueOptions
}

class IssueOptions {
    created: string
    challenge: string
    domain: string
    credentialStatus: CredentialStatus
}

class CredentialStatus {
    type: string
}

class IssueCredentialResponse {
    verifiableCredential: ICredential
}

let _ownDid: PortableDid;

async function getOwnDid(): Promise<PortableDid> {
    if(_ownDid) {
        return _ownDid;
    }
    _ownDid = await DidKeyMethod.create();
    return _ownDid;
}

export async function issueCredential(req: Request, res: Response) {
    const body: IssueCredentialBody = req.body;

    const ownDid = await getOwnDid()

    // build signing options
    const [signingKeyPair] = ownDid.keySet.verificationMethodKeys!;
    const privateKey = (await Jose.jwkToKey({ key: signingKeyPair.privateKeyJwk!})).keyMaterial;
    const subjectIssuerDid = ownDid.did;
    const signer = EdDsaSigner(privateKey);
    const signOptions: SignOptions = {
        issuerDid  : ownDid.did,
        subjectDid : ownDid.did,
        kid        : '#' + ownDid.did.split(':')[2],
        signer     : signer
    };

    const vcJwt: VcJwt = await VerifiableCredential.create(signOptions);
    res.json({jwt: vcJwt})
}

function EdDsaSigner(privateKey: Uint8Array): Signer {
    return async (data: Uint8Array): Promise<Uint8Array> => {
      const signature = await Ed25519.sign({ data, key: privateKey});
      return signature;
    };
  }