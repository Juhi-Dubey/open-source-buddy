# Open Source Buddy

एक AI-सहायक वेब ऐप जो शुरुआती लोगों को उनके पहले ओपन सोर्स योगदान को **खोजने, समझने और शुरू करने** में मदद करता है।

- समस्याओं (issues) को ब्राउज़ और सर्च करें, भाषा (language) और विषय (topic) के अनुसार फ़िल्टर करें
- सप्ताहांत का समय लगाने से पहले रिपॉज़िटरी की स्थिति (repo health) जांचें (अंतिम मर्ज किया गया PR, मेंटेनर का रिस्पॉन्स समय, CONTRIBUTING.md)
- सरल भाषा में सारांश, संभावित फ़ाइलें और शुरुआती योजना पाने के लिए **Explain this issue** दबाएं
- बाद के लिए issues सहेजें (save करें), लाइट और डार्क थीम के बीच स्विच करें

यह रिपॉज़िटरी **NIT जमशेदपुर में Hacktoberfest Hack Day** के लिए शुरुआती प्रोजेक्ट है। भाग लेने के लिए [CONTRIBUTING.md](CONTRIBUTING.md) देखें।

## इसे चलाएं (Run it)

आपको **Node.js 20 या नए** की आवश्यकता है (यह Windows, macOS और Linux पर काम करता है)। किसी डेटाबेस या API कुंजी (API keys) की आवश्यकता नहीं है।

```bash
git clone <your-fork-url>
cd open-source-buddy
npm install
npm run dev
```

फिर http://localhost:5173 खोलें। `npm run dev` एक्सप्रेस API (पोर्ट 3001) और Vite क्लाइंट (पोर्ट 5173) दोनों को एक साथ शुरू करता है।

## मॉक मोड बनाम लाइव मोड (Mock mode vs live mode)

| | मॉक (डिफ़ॉल्ट) | लाइव |
|---|---|---|
| GitHub डेटा | `server/github/mockData/` में स्थानीय नमूना JSON | असली GitHub REST API |
| इंटरनेट की आवश्यकता | नहीं | हाँ |
| UI संकेत | पीला **Sample data** बैनर | कोई बैनर नहीं |

मोड बदलने के लिए, `.env.example` को `.env` में कॉपी करें और इसे संपादित करें:

```bash
cp .env.example .env      # Windows पर: copy .env.example .env
```

- `GITHUB_MODE=live` असली GitHub API का उपयोग करता है। यह बिना टोकन के काम करता है (60 अनुरोध/घंटा)। अधिक अनुरोधों के लिए `GITHUB_TOKEN` जोड़ें।
- `AI_PROVIDER=mock` (डिफ़ॉल्ट) समस्या के शीर्षक, लेबल और विवरण (body) से स्पष्टीकरण बनाता है। किसी नेटवर्क की आवश्यकता नहीं है।
- `AI_PROVIDER=groq` Groq पर एक वास्तविक मॉडल के साथ स्पष्टीकरण तैयार करता है। इसके लिए एक मुफ़्त API कुंजी की आवश्यकता होती है, देखें [Groq का उपयोग करना](#groq-का-उपयोग-करना)।
- `AI_PROVIDER=ollama` आपकी अपनी मशीन पर चलने वाले मॉडल के साथ स्पष्टीकरण तैयार करता है। किसी API कुंजी की आवश्यकता नहीं है, देखें [स्थानीय Ollama मॉडल का उपयोग करना](#स्थानीय-ollama-मॉडल-का-उपयोग-करना)।
- `gemini` अभी लागू नहीं किया गया है।

कुंजियाँ (keys) और टोकन केवल सर्वर की `.env` फ़ाइल में रहते हैं। वे कभी भी ब्राउज़र को नहीं भेजे जाते हैं।

## स्थानीय Ollama मॉडल का उपयोग करना

[Ollama](https://ollama.com) स्थानीय स्तर पर ओपन मॉडल चलाता है, इसलिए **Explain this issue** बिना किसी बाहरी AI API कुंजी के काम करता है।

1. Ollama इंस्टॉल करें और एक बार मॉडल डाउनलोड करें: `ollama pull llama3.2`
2. सुनिश्चित करें कि Ollama चल रहा है (डेस्कटॉप ऐप ऐसा करता है, या `ollama serve` चलाएं)।
3. `.env` में `AI_PROVIDER=ollama` सेट करें, फिर `npm run dev` को पुनरारंभ (restart) करें।

| वेरिएबल | डिफ़ॉल्ट | अर्थ |
|---|---|---|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama सर्वर का पता। यदि Ollama किसी अन्य पोर्ट का उपयोग करता है या किसी अन्य मशीन पर चलता है तो इसे बदलें। |
| `OLLAMA_MODEL` | `llama3.2` | कोई भी मॉडल जिसे आपने पुल (डाउनलोड) किया है (`ollama list` उन्हें दिखाता है)। बड़े मॉडल बेहतर स्पष्टीकरण लिखते हैं लेकिन धीमे होते हैं। |
| `OLLAMA_TIMEOUT_MS` | `120000` | उत्तर के लिए कितनी देर प्रतीक्षा करनी है। मॉडल लोड होने के दौरान पहला अनुरोध धीमा हो सकता है। |

सर्वर Ollama के `/api/chat` एंडपॉइंट को कॉल करता है। यदि Ollama नहीं चल रहा है, मॉडल गायब है या अनुरोध टाइमआउट हो जाता है, तो स्पष्टीकरण पैनल एक संदेश दिखाता है कि क्या ठीक करना है। ये मान केवल सर्वर द्वारा पढ़े जाते हैं और कभी भी ब्राउज़र को नहीं भेजे जाते हैं।

## Groq का उपयोग करना

[Groq](https://groq.com) एक तेज़ API के साथ ओपन मॉडल होस्ट करता है और इसका एक मुफ़्त टियर (free tier) उपलब्ध है।

1. <https://console.groq.com/keys> पर एक कुंजी बनाएं।
2. `.env.example` को `.env` में कॉपी करें (यदि आपने अभी तक नहीं किया है) और सेट करें:

```bash
AI_PROVIDER=groq
GROQ_API_KEY=your-key-here
GROQ_MODEL=llama-3.3-70b-versatile   # वैकल्पिक, यह डिफ़ॉल्ट है
GROQ_TIMEOUT_MS=30000                # वैकल्पिक, यह डिफ़ॉल्ट है
```

3. `npm run dev` को पुनरारंभ करें और **Explain this issue** दबाएं। पैनल `AI provider: groq` दिखाता है।

कुंजी केवल Express सर्वर द्वारा पढ़ी जाती है। इसे `Authorization` हेडर में Groq को भेजा जाता है और इसे कभी भी ब्राउज़र को वापस नहीं भेजा जाता, लॉग में नहीं लिखा जाता या त्रुटि संदेशों में शामिल नहीं किया जाता है। `.env` git-ignored है, इसलिए इसे कमिट न करें।

यदि कुछ गलत होता है, तो पैनल क्रैश होने के बजाय एक संक्षिप्त संदेश दिखाता है:

| संदेश कहता है | समाधान |
|---|---|
| Groq is not configured | `.env` में `GROQ_API_KEY` सेट करें और सर्वर को पुनरारंभ करें |
| Groq rejected the API key | जांचें कि कुंजी पूरी तरह से कॉपी की गई थी और निरस्त (revoked) नहीं की गई है |
| The Groq rate limit was reached | थोड़ी देर प्रतीक्षा करें और पुनः प्रयास करें (मुफ़्त टियर की सीमाएं लागू होती हैं) |
| Groq does not accept the configured model | Groq मॉडल सूची के साथ `GROQ_MODEL` की वर्तनी (spelling) की जांच करें |
| Could not reach Groq / took too long | अपना कनेक्शन जांचें, या `GROQ_TIMEOUT_MS` बढ़ाएं |

## प्रोजेक्ट संरचना (Project structure)

```
open-source-buddy/
├── client/                  React + Vite फ़्रंटएंड
│   └── src/
│       ├── App.jsx          पेज लेआउट और साझा स्थिति (shared state)
│       ├── api.js           बैकएंड के लिए सभी कॉल
│       ├── components/      कार्ड्स, फ़िल्टर्स, विवरण पैनल, साइडबार ...
│       ├── hooks/           डेटा और थीम हुक्स
│       ├── styles/          CSS फ़ाइलें
│       └── utils/           छोटे सहायक फ़ंक्शन (helpers)
├── server/                  Node.js + Express बैकएंड
│   ├── index.js             ऐप एंट्री पॉइंट
│   ├── config.js            .env पढ़ता है
│   ├── routes/              /api/issues, /api/repos, /api/explain, /api/saved
│   ├── ai/                  AI प्रदाता इंटरफ़ेस + mock + Groq + Ollama (Gemini एक स्टब है)
│   ├── github/              GitHub प्रदाता इंटरफ़ेस + mock + live
│   ├── lib/                 फ़िल्टरिंग, पेजिनेशन, हेल्थ स्कोर, सहेजे गए इश्यू स्टोरेज
│   ├── auth/                वर्तमान उपयोगकर्ता कौन है
│   ├── middleware/          Express मिडलवेयर
│   └── data/saved.json     सहेजे गए इश्यू (स्वचालित रूप से निर्मित, git-ignored)
├── .github/                 पुल रिक्वेस्ट टेम्पलेट
├── CONTRIBUTING.md
└── .env.example
```

## API

| मेथड | पाथ | विवरण |
|---|---|---|
| GET | `/api/issues` | इश्यूज़ की सूची। क्वेरी: `q`, `language`, `topic`, `sort`, `page` |
| GET | `/api/repos/:owner/:name/health` | रेपो हेल्थ मेट्रिक्स और स्कोर |
| POST | `/api/explain` | बॉडी `{ "issue": {...} }`, AI स्पष्टीकरण लौटाता है |
| GET / POST / DELETE | `/api/saved` | सहेजे गए इश्यूज़ की सूची देखें, जोड़ें (`POST`) या हटाएं (`DELETE /api/saved/:id`) |

## लाइसेंस (License)

[MIT](LICENSE)

