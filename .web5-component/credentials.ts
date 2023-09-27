import express, { Request, Response } from 'express';
import type { ICredential } from '@sphereon/ssi-types'
import { VcJwt, VerifiableCredential, SignOptions } from '@web5/credentials';
import { DidKeyMethod } from '@web5/dids';
import { Ed25519, Jose } from '@web5/crypto';

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

// generate a did to sign credentials with
const alice = await DidKeyMethod.create();
const [signingKeyPair] = alice.keySet.verificationMethodKeys!;
const privateKey = (await Jose.jwkToKey({ key: signingKeyPair.privateKeyJwk!})).keyMaterial;
const subjectIssuerDid = alice.did;
const signer = EdDsaSigner(privateKey);
const signOptions: SignOptions = {
    issuerDid  : alice.did,
    subjectDid : alice.did,
    kid        : '#' + alice.did.split(':')[2],
    signer     : signer
};

export async function issueCredential(req: Request, res: Response) {
    const body: IssueCredentialBody = req.body;
    const vcJwt: VcJwt = await VerifiableCredential.create(signOptions, vcCreateOptions);
}

function EdDsaSigner(privateKey: Uint8Array): Signer {
    return async (data: Uint8Array): Promise<Uint8Array> => {
      const signature = await Ed25519.sign({ data, key: privateKey});
      return signature;
    };
  }