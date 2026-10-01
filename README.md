# Telaah AI

Sentiment and feedback analysis for training class reports. Everything runs in the browser, and no data is sent to a server.

## Features
- Import feedback PDFs, Excel or CSV files
- Sentiment analysis with a hybrid of IndoRoBERTa and an Indonesian lexicon (93.2% accuracy on SmSA)
- Net Sentiment Score, word cloud, aspects, ratings and instructor leaderboard
- Comment explorer with manual label correction, plus export

## Run locally
```bash
python serve.py 5510
```
Then open http://localhost:5510.

## Model
[`izzanfr/telaah-indonesian-sentiment-onnx`](https://huggingface.co/izzanfr/telaah-indonesian-sentiment-onnx) is an int8 ONNX version of [w11wo/indonesian-roberta-base-sentiment-classifier](https://huggingface.co/w11wo/indonesian-roberta-base-sentiment-classifier) (MIT). The browser loads it with Transformers.js.

## Deploy
Live at https://telaah-ai.vercel.app. Every push to `main` deploys automatically through Vercel.

---
Made by Izzan Faikar Ramadhy
