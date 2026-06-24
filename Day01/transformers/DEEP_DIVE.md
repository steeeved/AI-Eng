# Transformers Deep Dive: How ChatGPT Actually Thinks
### A complete breakdown of the four-panel demo — what each panel teaches, why it matters, and how to frame it for your YouTube audience

---

## The Central Thesis

Every time you send a message to ChatGPT and watch words appear one by one, you are watching a transformer complete four operations in rapid succession — **tokenize, embed, attend, predict**. That loop repeats for every single word you see. The four panels of this demo are not arbitrary. They are those four operations, made visible and interactive.

Grant Sanderson (3Blue1Brown) opens his lesson with a deceptively simple framing:

> *"A transformer is trained to take in a piece of text… then produce a prediction of what comes next, in the form of a probability distribution over all chunks of text that might follow."*

The whole article — and this entire demo — is an unpacking of that one sentence. This document explains what each panel is teaching, where it lives in the 3B1B framework, and how you can use it to build a compelling YouTube video that makes these concepts genuinely land for a non-technical audience.

---

## Panel 1 — The Tokenizer

### What the panel does

A live textarea where you type anything and watch your text split into coloured chunks in real time. Each chunk shows its vocabulary ID (a number between 0 and 50,256 in GPT-4's case). A running counter shows total tokens and an estimated API cost.

### What it is teaching

The panel is making one argument: **the model does not read words, it reads tokens**. This sounds trivial but its implications ripple through everything else.

In the 3B1B article, tokenization is described as the very first operation the transformer performs — before any mathematics, before any intelligence, the input is broken into *chunks*:

> *"An input is first broken into small chunks that are known as tokens. For example, in the sentence 'To date, the cleverest thinker of all time was …' the tokenization would be: To | date | , | the | cle | ve | rest | thinker | of | all | time | was …"*

Notice what happened to the word *"cleverest"* — it became three tokens: `cle`, `ve`, `rest`. This is not a bug. It is the Byte Pair Encoding (BPE) algorithm at work. BPE was trained on a massive text corpus, and it learned that `cleverest` is rare enough that compressing it into three sub-word units is more efficient than giving every inflected form of every rare word its own vocabulary slot.

The key concepts the panel is unlocking:

**Tokens ≠ words.** "tokenization" (the word) costs 4 tokens. "dog" costs 1. "supercalifragilistic" might cost 6. This asymmetry matters because *you pay per token* on every OpenAI API call. A sentence that feels short to a human might be expensive to the model.

**The vocabulary is fixed.** GPT-4's tokenizer knows exactly 100,277 tokens. Everything you will ever say to it must be expressible using those chunks. This is why models sometimes struggle with invented words, non-English scripts, or code in unusual languages — the tokenizer may have to fall back to single-character tokens, making the input far longer and harder to process.

**Position is encoded here.** In the 3B1B article, he notes that the embedding will *also* encode information about position — where in the sentence a token sits. The tokenizer's output is the thing that gets those position signals added. This is why token length limits exist: GPT-3 could only process 2,048 tokens at once because its position encodings only went up to 2,048.

**The model never sees your actual text again.** After this step, your words are gone. What flows through the entire rest of the neural network — all 96 layers, all 96 attention heads, all 175 billion parameters in GPT-3 — is arrays of numbers. The panel is showing you the precise moment language becomes mathematics.

### Real-world AI connection

Every cost estimate you see on the OpenAI pricing page is per-1,000 tokens, not per word or per character. When a company spends $200,000 a month on API calls, they are paying for tokenization efficiency. Prompt engineering at scale is partly about writing fewer tokens without losing meaning.

This is also why fine-tuned models for specific languages (Japanese, Arabic, code) are valuable — general BPE tokenizers trained primarily on English data are extremely inefficient at representing those scripts. A sentence of Japanese that would be 15 characters might cost 30+ tokens.

### Video framing

**Hook moment:** Type the word `definitely` into the demo. It costs 3 tokens: `def`, `in`, `itely`. Now ask your audience — *"Why does GPT sometimes misspell words like 'definitely'? It's partly because the model never processes the whole word as a single unit in training. It sees fragments."* This gets a reaction every time.

**The cost reveal:** Show the token counter on a paragraph of text, then show it on the same paragraph in a different language. The cost difference surprises people.

---

## Panel 2 — The Embedding Space

### What the panel does

A 2D scatter plot of ~80 common words rendered as interactive dots, reduced from their high-dimensional vector representations using Principal Component Analysis (PCA). Click a word to highlight its nearest neighbours. The king/queen/man/woman analogy is shown as actual vectors you can trace in the space.

### What it is teaching

This panel is making the hardest conceptual leap of the four: **meaning is geometry**. Words that mean similar things end up near each other in a high-dimensional space — not because a human put them there, but because the model learned that placing them close together made its predictions better.

The 3B1B article spends more time on this concept than on any other single idea:

> *"The big idea we need to understand here is that as a model tweaks and tunes its weights to decide how exactly words get embedded as vectors during training, it tends to settle on a set of embeddings where directions in this space have meaning."*

And then, the classic example:

> *"The difference between the vectors for 'woman' and 'man' is quite similar to the difference between 'king' and 'queen'. So if the word for a female monarch was unknown, it could be found by taking 'king', adding the direction of 'woman' minus 'man', and searching for the closest word embedding."*

This is not a metaphor. You can literally do the arithmetic:

```
king − man + woman ≈ queen
Italy − Germany + Hitler ≈ Mussolini
```

Sanderson is careful to note this is approximate — the real embedding of `queen` is "a little farther off than the difference would suggest" because `queen` is used in training data in ways beyond just being a female monarch (music, chess, drag culture). The model learned from context, not from definitions.

The key concepts the panel is unlocking:

**The embedding matrix is the first learned parameter.** In GPT-3, it contains 617 million weights — just this one matrix. Every word in the 50,257-word vocabulary gets a 12,288-dimensional vector. Those 12,288 numbers encode everything the model learned about that word's meaning from training.

**PCA is a white lie told in service of truth.** The scatter plot you see is not the real embedding space. It is a 2D projection of a 12,288-dimensional space. Some information is inevitably lost. The demo uses this projection as a visual aid while acknowledging the underlying reality is much richer. This is worth explaining to your audience — the map is not the territory, but the map is still useful.

**Context will change these vectors.** This is the twist Sanderson plants here and pays off in the attention section. When he talks about the word "model" (as in *fashion model* vs *machine learning model*), he is foreshadowing attention: the embedding starts as a static lookup, but attention will *modify* it based on surrounding words. The initial embedding is the *starting point*, not the final answer.

**Dot products measure alignment.** The article introduces this mathematical idea here and it becomes foundational for understanding attention. If two vectors point in similar directions, their dot product is high. This is how the model asks "how similar are these two words?" — it computes a dot product. The similarity clustering you see in the embedding plot is essentially the model's learned dot-product structure made visible.

### Real-world AI connection

Semantic search is this panel's killer app. When you type a query into a vector database (like Pinecone, Weaviate, or Chroma), the search works by embedding your query into the same space as all the stored documents, then finding the nearest neighbours. There is no keyword matching. The model that produced the embeddings learned that "cardiac arrest" and "heart attack" are geometrically close, so a search for one will surface documents about the other.

Every recommendation system that a user encounters — what to watch next on Netflix, similar products on Amazon, related articles on Medium — is an embedding system at its core. The panel is showing the fundamental mechanism behind billions of daily user interactions.

This is also directly relevant to RAG (Retrieval-Augmented Generation), the architecture that makes ChatGPT useful for your specific documents. You embed your documents, store them in a vector DB, embed the user's question, find the closest docs, and pass them to the model as context.

### Video framing

**The analogy that lands:** Tell your audience to imagine a giant 3D room (actually 12,288-D, but let's start with 3D). Every word in the English language is a dot somewhere in this room. Words that are used in similar situations end up near each other — not because anyone designed it that way, but because the model discovered that clustering them together made prediction easier. The room *self-organised* during training.

**The vector arithmetic moment:** Do it live in the demo. Click `king`, then `man`, then explain you're going to subtract `man` and add `woman`. Point to where `queen` ends up. This is the moment audiences lean in.

---

## Panel 3 — The Attention Heatmap

### What the panel does

Feed in a sentence and get back an attention matrix — a grid of coloured cells where each row represents a token asking a question and each column represents a token being attended to. The intensity of each cell shows how strongly the row token is attending to the column token. A layer and head selector lets you explore different attention heads in the network (GPT-2's 12 layers × 12 heads = 144 different learned attention patterns).

### What it is teaching

This panel is teaching **how the model reads in context** — the mechanism that allows a transformer to be transformatively (pun intended) better than all prior language models. Before transformers, RNNs and LSTMs had to process text sequentially. Attention processes every token in parallel, letting every token directly query every other token.

The 3B1B article introduces attention as the answer to a problem set up by the embedding panel:

> *"The Attention Block is responsible for figuring out which words in the context are relevant to updating the meanings of other words and how exactly those meanings should be updated."*

And then, the specific example the demo uses:

> *"The meaning of the word 'model' in the phrase 'a machine learning model' is different from its meaning in the phrase 'a fashion model'."*

The word *model* gets the same initial embedding regardless of context. It is the attention mechanism that modifies that embedding based on what's around it. After attention, the vector for `model` has been *pulled* toward the `machine learning` region of the embedding space or the `fashion` region depending on context.

The canonical demo sentence — *"The animal didn't cross the street because it was too tired"* — is chosen carefully. What does `it` refer to? As humans we immediately parse it as `animal`, not `street`. The attention heatmap shows the model doing the exact same parsing: in the right layers and heads, the token `it` has high attention weights toward `animal`. The model solved pronoun coreference through geometry.

The key concepts the panel is unlocking:

**Queries, Keys, and Values.** Sanderson covers this in the companion attention lesson. Every token produces three vectors: a Query (what am I looking for?), a Key (what do I contain?), and a Value (what do I contribute if attended to?). The attention weight between two tokens is the dot product of one's Query and the other's Key, passed through a softmax. This is why dot products were introduced in the embedding panel — the same operation that measures vector similarity is the operation that drives attention.

**Different heads learn different relationships.** The layer/head selector in the demo is not decorative. Head 1 in Layer 1 might track syntactic dependencies. Head 4 in Layer 8 might track pronoun coreference. Head 11 in Layer 11 might track positional patterns (attending to the previous token). GPT-3 has 96 layers × 96 heads = 9,216 individual attention heads, each potentially specialised in a different linguistic relationship. No engineer specified these specialisations — they emerged from training.

**Attention is the transformer's superpower over prior architectures.** Before transformers, the word at position 1 and the word at position 512 could only communicate by passing information through every token in between, sequentially. Attention is a direct phone line from any token to any other token in the context window. This is why transformers can handle long-range dependencies — references and callbacks that span thousands of tokens — that broke earlier models.

**The context window is a hard limit.** Sanderson notes GPT-3 was trained with a 2,048-token context. GPT-4 expanded this to 128,000 tokens. The attention matrix is quadratic — doubling the context length quadruples the computation. This is why context window expansion is a major engineering challenge and a competitive differentiator between model providers.

### Real-world AI connection

Attention is the mechanism behind **code completion understanding**. When GitHub Copilot suggests the body of a function, it is attending to the function signature, the variable names, the imports at the top of the file, and potentially your docstring — all simultaneously, through the attention mechanism.

It is also behind **cross-modal attention** in models like GPT-4 Vision. When you show the model an image and ask a question about it, image patches are embedded as vectors and placed in the same sequence as your text tokens. The attention mechanism lets text tokens attend to image patches and vice versa. The `it` in "What is it doing?" can resolve to a dog in a photo through exactly the same mechanism that resolves pronouns in text.

The attention heatmap is also directly relevant to **interpretability research** — the fast-growing field trying to understand *what* these models have learned. Anthropic's mechanistic interpretability team, DeepMind's research, and many academic groups use attention patterns as a window into model internals. When you use the demo to visualise attention, you are doing what professional AI researchers do.

### Video framing

**The pronoun moment is your centrepiece.** Type "The animal didn't cross the street because it was too tired." Select Layer 5, Head 9 (adjust for the specific model weights used). Show the heatmap. Point to the `it` row. Show the bright cell on `animal`. Say: *"The model just solved a problem that took linguists decades to formalise — pronoun coreference — through matrix multiplication. No rules. No grammar. Just geometry."*

**The multiple heads reveal:** Click through several different heads on the same sentence and show that the pattern changes completely. *"Each of these 144 heads learned something different about language. Nobody told them what to learn."* This is the moment the scale of what training produces starts to feel real.

---

## Panel 4 — The Tiny GPT

### What the panel does

A character-level language model trained on Shakespeare, running entirely in the browser. The user types a seed (default: "To be"), hits Generate, and watches characters appear one at a time. Below the text output, a live bar chart shows the probability distribution over the top-10 most likely next characters after each step. A temperature slider visibly reshapes the distribution in real time.

### What it is teaching

This panel closes the loop. Everything the other three panels showed in isolation — tokenization, embedding, attention — culminates in this: **text generation is a loop of probability sampling**. The model does not "know" what it wants to say. It predicts the probability of every possible next character, samples one according to those probabilities, and feeds it back in. Every character you see appear is one iteration of this loop.

The 3B1B article describes this loop precisely:

> *"Once you have a prediction model like this, one simple way to make this generate a longer piece is to give it an initial bit of text to work with, have it predict the next word, take a random sample from the distribution it just generated, then run it all again to make a new prediction based on all the text, including what it just added. This process of repeated prediction and sampling is essentially what's happening when you interact with ChatGPT and see it producing one word at a time."*

The panel also gives the temperature control its concrete demonstration. In the article:

> *"We can add a little extra spice into this softmax function with a constant T inserted into all these exponents. We call it 'temperature'… When T is larger, more weight is given to lower values, making the distribution more uniform. When T is smaller, the larger values will dominate the distribution, and in the extreme setting when T is equal to 0, all the weight goes to the maximum value."*

The bar chart makes this viscerally visible. Set temperature to 0.1 and watch one bar dominate — the model becomes a robot, always picking the most likely character. Set temperature to 1.8 and watch the bars flatten — the model becomes chaotic, picking uncommon characters frequently. This is not an illustration of what softmax does. This *is* softmax, live in the browser.

The key concepts the panel is unlocking:

**Logits → Softmax → Probabilities → Sample → Repeat.** The article introduces this pipeline for the unembedding layer (the final step that converts the last vector into a probability distribution over vocabulary). This panel makes every step in that pipeline visible and interactive.

**The model is not "choosing" — it is sampling.** This is a conceptual correction many people need. ChatGPT does not have a fixed answer stored somewhere that it retrieves. It generates each token probabilistically. Run the same prompt twice with the same model and you may get a different answer. This is why `temperature=0` is used for reproducible, deterministic outputs in production systems (code generation, structured data extraction) and higher temperatures are used for creative tasks.

**The forward pass is the whole show.** The demo's architecture explainer notes that a real GPT runs the embedding through N transformer blocks (each containing attention + MLP), but the fundamental input/output contract is the same: take a context, produce a probability distribution over the next token. This demo uses a bigram model for the same contract. *Same math. Same loop. Different scale.*

**Autoregressive generation has a compounding error problem.** When the model makes a mistake — samples an unlikely character — that mistake becomes the new context for the next step. Errors compound. This is why GPT outputs can sometimes drift off-topic mid-paragraph: an early sampling accident set the model on a trajectory it cannot easily escape. Temperature is the primary lever for managing this risk.

**Karpathy's nanoGPT builds this from scratch.** Andrej Karpathy's 2-hour video (*"Let's build GPT: from scratch, in code, spelled out"*) starts from exactly this bigram model and incrementally adds every transformer component — positional encodings, self-attention, multi-head attention, residual streams, layer normalisation — until he has a model that generates plausible Shakespeare. The panel's architecture explainer explicitly maps to that progression.

### Real-world AI connection

Every production LLM inference system in the world — ChatGPT, Claude, Gemini, Llama — is running this exact loop, at scale. The engineering challenges that make it commercially viable (batching, key-value caching, quantisation, speculative decoding) are all optimisations to this core forward-pass loop.

**Temperature in production** is not just a demo feature. OpenAI's API exposes it as a parameter. Anthropic's API exposes it. When a company builds a customer support bot, they typically set temperature to 0 or 0.1 (deterministic, consistent answers). When they build a creative writing assistant, they set it to 0.7–1.0 (varied, interesting outputs). Understanding temperature is understanding one of the most consequential knobs in production AI.

**The "next token prediction" framing explains emergent capabilities.** This is subtle but important for the video: GPT-4 was trained *only* on next-token prediction. It was never explicitly taught to reason, to code, to pass bar exams, or to write poetry. Those capabilities emerged from training on enough text to predict the next token well. The panel is showing the smallest possible version of the thing that, at scale, produced capabilities that surprised even the people who built the model.

---

## The Pipeline: How All Four Panels Connect

Understanding each panel individually is valuable. Understanding how they chain together is the real payoff.

```
Your text
    │
    ▼ PANEL 1 — TOKENIZER
"Hello world" → [15496, 995]   (two token IDs)
    │
    ▼ PANEL 2 — EMBEDDING
[15496, 995] → [[0.2, -0.7, 0.1, … ×12288],   (two 12,288-dim vectors)
                 [0.8,  0.3, 0.4, … ×12288]]
    │
    ▼ PANEL 3 — ATTENTION (×96 layers)
Each vector attends to all others → context-enriched vectors
"Hello" now knows it precedes "world"; "world" carries that context
    │
    ▼ PANEL 4 — UNEMBEDDING + SOFTMAX + SAMPLE
Last vector → logits [50,257 raw scores]
→ softmax(logits / T) → probabilities
→ sample one token → append → repeat from Panel 1
```

This is the entire transformer, stripped to its bones. GPT-4 does this loop for every token in your response. The loop might run 200 times to give you a paragraph. Each iteration involves all 175 billion parameters firing in sequence.

---

## YouTube Video Structure

### Recommended runtime: 55–75 minutes

### Act 1 — Hook & Setup (0:00–5:00)

Open with the question: *"What is actually happening when ChatGPT types to you?"*

Show the demo landing on Panel 1. No explanation yet — just type something and show the tokens appear. Let the audience wonder.

Then: *"By the end of this video, you will understand every single step in that loop. And you will have built an interactive demo that shows it."*

### Act 2 — Panel 1: Tokenizer (5:00–18:00)

Explain BPE. Show expensive tokenizations (rare words, non-English text). Show the cost counter.

Key insight to land: *"The model does not read your words. It reads these chunks. After this step, language is gone. Only numbers remain."*

### Act 3 — Panel 2: Embedding Space (18:00–32:00)

Introduce the embedding matrix (617M parameters just for this). Show the scatter plot. Do the king–queen vector arithmetic live.

Key insight to land: *"This is why AI can find documents about 'cardiac arrest' when you search for 'heart attack'. The meaning is encoded in geometry, not keywords."*

Introduce the 3B1B dot product intuition here — it will pay off in the attention section.

### Act 4 — Panel 3: Attention (32:00–50:00)

This is the heart of the video and deserves the most time.

Explain the limitation the embedding creates: every word starts with the same vector regardless of context. Attention is how context changes meaning.

Walk through the pronoun coreference example step by step. Show multiple heads — emphasise that each head learned something different autonomously.

Key insight to land: *"Before transformers, language models had to process words one at a time. Attention is a direct connection between any two tokens in the entire context window. This is why GPT-4 can maintain coherence across a 100,000-word document."*

### Act 5 — Panel 4: Tiny GPT (50:00–65:00)

This is the payoff. Everything comes together here.

Show the generation loop at slow speed. Pause on the probability bar chart. Move the temperature slider and watch the bars change shape — relate this to the softmax equation from the 3B1B article.

Key insight to land: *"ChatGPT is not looking up answers. It is rolling a weighted die — millions of times — shaped by 175 billion parameters trained on most of the internet. Every word you see is one roll."*

### Act 6 — Close & Next Steps (65:00–75:00)

Return to the pipeline diagram. Walk through the four panels as one connected flow.

Connect to what comes next: *"Now you understand the architecture. In the next video, we build the attention mechanism from scratch in code — following Karpathy's nanoGPT — and train it on Shakespeare."*

End with the demo running, generating Shakespeare text, temperature slider moving.

---

## Core Quotes from 3Blue1Brown to Use in the Video

These are direct pulls from the article that work well as spoken lines or on-screen text:

> *"The big idea we need to understand here is that as a model tweaks and tunes its weights to decide how exactly words get embedded as vectors during training, it tends to settle on a set of embeddings where directions in this space have meaning."*

> *"Think about our understanding of a word, like quill. Its meaning is clearly informed by its surroundings and context, whether it be a hedgehog quill or a type of pen."*

> *"The Attention Block is responsible for figuring out which words in the context are relevant to updating the meanings of other words and how exactly those meanings should be updated."*

> *"This process of repeated prediction and sampling is essentially what's happening when you interact with ChatGPT and see it producing one word at a time."*

> *"When T is larger, more weight is given to lower values, making the distribution more uniform. When T is smaller, the larger values will dominate."*

---

## Things That Will Surprise Your Audience

These are facts from the 3B1B article or the underlying research that tend to produce visible reactions:

1. **GPT-3 has 175 billion parameters but only 8 types of matrices.** The complexity is in the scale, not the variety.
2. **The embedding matrix alone has 617 million parameters** — more than many entire models that ran on consumer hardware just a few years ago.
3. **GPT-3's context window was 2,048 tokens.** Claude 3's context window is 200,000 tokens. GPT-4's is 128,000. Context is the new benchmark.
4. **GPT was never explicitly taught anything.** It was trained on next-token prediction. Reasoning, coding, and poetry emerged.
5. **The word "queen" is not exactly where the king−man+woman formula predicts** — because queen is used in training data in contexts far beyond royalty. The model learned real usage patterns, not definitions.
6. **Temperature was borrowed from thermodynamics.** The analogy to molecular energy distributions is not just decorative — the mathematics is genuinely related.
7. **All of GPT-3's 175 billion weights are organised into just under 28,000 matrices** — a very structured architecture underneath the enormous scale.

---

*Built as part of the 60-day AI Engineer course — Day 1 foundations.*
*Demo repository: `/transformers` — run `npm run dev` and visit `localhost:3000/demo/tokenizer`*
