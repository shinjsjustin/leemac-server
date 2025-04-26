const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const OpenAI = require("openai");
const {pdfToPng} = require('pdf-to-png-converter'); 

const upload = multer({ dest: "uploads/" });
const openai = new OpenAI({ apiKey: process.env.CHATGPT_API_KEY });

router.post("/analyze-pdf", upload.single("file"), async (req, res) => {
    const prompt = `
      You are an expert CNC job planner. Given the technical drawing, extract these:

      Part number
      Part title
      Revision
      Material
      Finishing instructions
      Dimensions of material to purchase (length, width, height or diameter, length. Whichever you decide to use, fill the other with 0. Return the dimensions in inches)
      Estimate price range ($USD/unit)

      To calculate the price range, consider the following:
        - Material cost (Aluminum: $0.5 x inches^3, Steel: $3 x inches^3, Plastic: $0.01 x inches^3)
        - Labor cost (CNC machining: $150/hour, larger parts take longer)
        - Programming costs ($100/hour, more complex parts take longer)
      Return the results as a JSON I can pass to my front end to parse manually. If missing, use "unknown". Please follow the format below exactly (feel free to use comments to add what you'd like):
        {"part_number": "unknown","part_title": "unknown","revision": "unknown","material": "unknown","finishing_instructions": "unknown","dimensions_plate": {"length": 0,"width": 0,"height": 0},"dimensions_bar": {"length": 0,"diameter": 0},"price_range": {"low": 0,"high": 0}"comments": {}}
    `;
    try {
        console.log("Request received for /analyze-pdf");
        if (!req.file) {
            return res.status(400).send("No file uploaded.");
        }

        const pdfFilePath = req.file.path;
        const outputFolder = "uploads/images";

        // Ensure the output folder exists
        if (!fs.existsSync(outputFolder)) {
            console.log("Creating output folder: ", outputFolder);
            fs.mkdirSync(outputFolder, { recursive: true });
        }

        console.log("Starting PDF to image conversion for pdf: ", pdfFilePath);
        // Convert the first page of the PDF to PNG
        const pngPages = await pdfToPng(pdfFilePath, {
            viewportScale: 2.0,
            outputFolder: outputFolder,
            pagesToProcess: [1],
        });

        const pngFilePath = pngPages[0]?.path;
        if (!pngFilePath) {
            console.error("Failed to convert PDF to PNG.");
            fs.unlinkSync(pdfFilePath); // Clean up the uploaded PDF file
            return res.status(500).send("Failed to convert PDF to PNG.");
        }

        console.log("PDF converted to PNG: ", pngFilePath);

        const base64Image = fs.readFileSync(pngFilePath, "base64");
        const response = await openai.responses.create({
            model: "gpt-4.1-mini",
            input: [
                {
                    role: "user",
                    content: [
                        { type: "input_text", text: prompt },
                        { type: "input_image", image_url: `data:image/png;base64,${base64Image}` }
                    ]
                }
            ]
        });

        console.log("Raw response output:", response.output_text);

        // Extract JSON from response.output_text
        const jsonMatch = response.output_text.match(/```json\n([\s\S]*?)\n```/);
        if (!jsonMatch) {
            console.error("Failed to extract JSON from response.");
            return res.status(500).send("Failed to extract JSON from response.");
        }

        const jsonResponse = JSON.parse(jsonMatch[1]); // Parse the extracted JSON
        console.log("Parsed JSON response:", jsonResponse);

        res.status(200).json({ result: jsonResponse });

        // Clean up the uploaded PDF file
        fs.unlinkSync(pdfFilePath);
        console.log("Uploaded PDF file deleted: ", pdfFilePath);

        // Clean up the generated PNG file
        if (fs.existsSync(pngFilePath)) {
            fs.unlinkSync(pngFilePath);
            console.log("Generated PNG file deleted: ", pngFilePath);
        }
    } catch (error) {
        console.error("Error Analyzing Drawing:", error);
        res.status(500).send("An error occurred while processing the Drawing.");
    }
});

module.exports = router;