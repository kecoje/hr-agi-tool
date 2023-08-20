import { Configuration, OpenAIApi } from "openai";
import * as fs from "fs"
import * as dotenv from "dotenv";
import * as FormData from "form-data";
import { options } from "yargs";
import axios from "axios"
import * as express from "express";
import { Express, Request, Response, NextFunction } from "express";
import * as multer from 'multer';
import * as path from 'path';
import * as cors from 'cors';
import * as http from 'http';
import * as https from 'https';
import * as PDFParser from 'pdf-parse';
import { GithubData, scrapeGithubProfile } from "./src/github";

const app: Express = express();

dotenv.config();

const storage = multer.memoryStorage(); // Store file in memory for parsing
const upload = multer({ storage: storage });

app.use(cors({ origin: true }));
app.options('*', cors());

app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.get('/initial-url', (req: Request, res: Response) => {
    res.status(200).send("Waiting")
});

app.get('/', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/execute', upload.fields([{ name: 'pdfFile', maxCount: 1 }, { name: 'jobPosition', maxCount: 1 }]), async (req: Request, res: Response) => {
    try {
        //@ts-ignore
        const pdfFile = req.files['pdfFile'][0]; // Access the PDF file
        const jobPosition = req.body.jobPosition; // Access the text input

        if (!pdfFile) {
            res.status(400).json({
                data: null,
                messages: ['No PDF file uploaded'],
                success: false,
            })
            return;
        }

        const pdfBuffer = pdfFile.buffer;

        // Read and parse the PDF file
        const pdfData = await PDFParser(pdfBuffer)
        // Access the parsed PDF content using pdfData.text
        const pdfContent = pdfData.text;

        // Print both the text input and parsed PDF content
        console.log('Text Input:', jobPosition);
        console.log('PDF Content:', pdfContent);

        const openai = new OpenAIApi(new Configuration({
            organization: process.env.OPENAI_API_ORG,
            apiKey: process.env.OPENAI_API_KEY,
        }));

        const linkedinLinkRegex = /https:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_.-]+/g;
        const linkedinLink = pdfContent.match(linkedinLinkRegex)?.[0] ?? null;

        const githubLinkRegex = /https:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.-]+/g;
        const githubLink = pdfContent.match(githubLinkRegex)?.[0] ?? null;

        let githubData: GithubData | null = null
        if(githubLink && githubLink.length > 5){
            githubData = await scrapeGithubProfile(githubLink)
        }

        const response = await openai.createChatCompletion({
            model: "gpt-3.5-turbo-16k", // Specify the model you want to use
            messages: [
                {
                    role: "system",
                    content: `You are now an HR specialtist, hiring for a role of a "${jobPosition}".
                        We want a suitable person for the position of "${jobPosition}".
                        Your output should be in a form of a json with fields like so:

                        {
                            "candidate_pros": string[],
                            "candidate_cons": string[],
                            "candidate_score": number,
                            "short_elaboration": string,
                        }
                        
                        Do not output anything else but this json string!
                        Candidate pros and cons should be a few elements long with each element describing a pro or a con in a few words.
                        candidate_score should be a number between 0 and 100, reflecting how suitable is this candidate for the position.
                        A score of 100 would mean a perfect fit, and a score 0 zero very bad fit.
                        Also write a short elaboration on why did you give this score to the candidate.`
                },
                {
                    role: "user",
                    content: ` 
                        Review the following CV:\n
                        ${pdfContent}\n`
                        + githubData !== null ? 
                        `Also take into consideration this github data:\n
                        ${JSON.stringify(githubData, null, 2)}\n` 
                        : ''
                }
            ],
            max_tokens: 9000,
            n: 1,
        });

        const textOut = response.data.choices.map(c => c.message?.content ?? '').join('\n');

        let jsonOut: {
            candidate_pros: string[],
            candidate_cons: string[],
            candidate_score: number,
            linked_in_url: string,
            github_url: string,
            github_data: GithubData | null
        }
        try {
            jsonOut = JSON.parse(textOut)
            jsonOut.linked_in_url = linkedinLink ?? ''
            jsonOut.github_url = githubLink ?? ''
            jsonOut.github_data = githubData
        } catch (error) {
            res.status(400).json({
                data: null,
                messages: [textOut],
                success: false,
            })
            return
        }

        res.status(200).json({
            data: {
                jobPosition,
                pdfContent,
                jsonOut
            },
            messages: [],
            success: true,
        })
    } catch (error: any) {
        res.status(500).json({
            data: null,
            messages: [error.toString()],
            success: false,
        })
    }
});

app.get('/*', (req, res) => {
    res.status(404).json({
        data: null,
        messages: [
            'Resource not found',
        ],
        success: false,
    })
    return;
})

const port = 8800;
const secure_port = 8800;

if (process.env.NODE_ENV == 'production') {
    var privateKey = fs.readFileSync('./ssl/private.key', 'utf8');
    var certificate = fs.readFileSync('./ssl/chainedCertificate.crt', 'utf8');
    var credentials = { key: privateKey, cert: certificate };

    var httpsServer = https.createServer(credentials, app);

    httpsServer.listen(secure_port, () => { console.log(`Running https on port ${secure_port}`) });
} else {
    var httpServer = http.createServer(app);

    httpServer.listen(port, () => { console.log(`Running http on port ${port}`) });
}