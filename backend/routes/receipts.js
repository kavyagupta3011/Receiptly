const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { exec } = require('child_process');
const Receipt = require('../models/Receipt');
const protect = require('../middleware/authMiddleware');

// Setup multer to store images in /uploads
const upload = multer({ dest: 'uploads/' });

// GET all receipts
router.get('/', async (req, res) => {
  try {
    const receipts = await Receipt.find();
    res.json(receipts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch receipts' });
  }
});

// POST a new receipt and run OCR
router.post('/', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }

  const imagePath = path.join(__dirname, '..', req.file.path);

  exec(`python receipt_ocr.py -i "${imagePath}"`, async (err, stdout, stderr) => {
    if (err) {
      console.error('OCR Error:', stderr);
      return res.status(500).json({ error: 'OCR processing failed' });
    }

    try {
      const ocrData = JSON.parse(stdout);
      console.log("Saving to DB:", ocrData);


      const receipt = new Receipt({
        ...ocrData,
        user: req.user._id,
        imageUrl: req.file.path,
        uploadedAt: new Date(),
      });

      await receipt.save();
      res.status(201).json(receipt);
    } catch (parseErr) {
      console.error('Parsing OCR output failed:', parseErr);
      res.status(500).json({ error: 'OCR output was not valid JSON' });
    }
  });
});

router.get('/analysis', async (req, res) => {
  try {
    const receipts = await Receipt.find();

    const analysisScriptPath = path.join(__dirname, '..', 'expensesanalysis.py');
    exec(`python ${analysisScriptPath}`, (err, stdout, stderr) => {
      if (err) {
        console.error('Analysis script error:', stderr);
        return res.status(500).json({ error: 'Expense analysis failed' });
      }

      try {
        const analysisData = JSON.parse(stdout);  // 👈 parse the JSON your Python script outputs
        res.json({
          receipts,
          analysis: analysisData,
          images: [
            '/analysis_images/monthly_trend.png',
            '/analysis_images/pie_chart.png',
            '/analysis_images/heatmap.png'
          ]
        });
      } catch (parseErr) {
        console.error('Failed to parse analysis output:', parseErr);
        res.status(500).json({ error: 'Invalid analysis output' });
      }
    });
  } catch (err) {
    console.error('DB fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch receipts' });
  }
});


module.exports = router;
