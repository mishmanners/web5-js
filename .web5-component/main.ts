import express from 'express';
import { issueCredential } from './credentials';
import type * as http from 'http';
import type { Request, Response } from 'express'
const app: express.Application = express();
app.use(express.json());

app.post("/credentials/issue", issueCredential);

app.get("/ready", (req, res) => {
    res.send("ok");
});

let server: http.Server;
app.get("/shutdown", (req: Request, res: Response) => {
    res.send("ok");
    console.log("shutting down server");
    server.close((e) => {
        if(e) {
            console.error(e);
        }
    });
});

server = app.listen(8080);