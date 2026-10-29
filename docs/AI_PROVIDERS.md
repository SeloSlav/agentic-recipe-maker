# Cloud and local AI providers

Baba Selo supports native Anthropic Messages, Google Gemini, Ollama, Mistral, Cohere, Amazon Bedrock Converse, and Azure OpenAI adapters, as well as OpenAI and hosts that implement its chat protocol. Chat, recipe generation, enrichment, substitutions, translation, meal plans, titles, and recipe follow-ups all use the selected provider. No OpenAI key is required when using another provider.

Configure `.env.local`, then restart `npm run dev`. `/admin/ai` shows the provider, models, and embedding configuration without exposing credentials. “Configured” means configuration is present, not that credentials or model access have been verified.

## Local inference with Ollama

Install [Ollama](https://ollama.com/download), start its service (`ollama serve` if needed), and pull a tool-capable chat model plus an embedding model:

```sh
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
```

Put this in `.env.local`:

```dotenv
AI_PROVIDER=ollama
AI_MODEL=qwen2.5:7b
AI_BASE_URL=http://127.0.0.1:11434
AI_EMBEDDING_PROVIDER=ollama
AI_EMBEDDING_MODEL=nomic-embed-text
OPENAI_API_KEY=
```

The app uses Ollama's **native** `/api/chat` and `/api/embed` APIs, including streamed replies and tool calls. It does not download models automatically. The example chat model is about 4.7 GB; inference speed and memory use depend on your hardware. After downloading the software/models, core text generation and semantic retrieval can run without cloud inference. Generated images and transcription are optional, separate OpenAI features.

## Cloud provider matrix

Set `AI_PROVIDER`, `AI_MODEL`, and the corresponding credential below. `AI_API_KEY` can replace the named credential for the selected chat provider. Use an exact model ID available to your account, with **tool calling** enabled for agent chat. Model catalogs and regional access change, so cloud model IDs are deliberately not hardcoded outside the existing OpenAI default.

| `AI_PROVIDER` | API / authentication | Default embedding model |
| --- | --- | --- |
| `openai` | Native OpenAI chat; `OPENAI_API_KEY` | `text-embedding-3-small` |
| `anthropic` | Native Messages; `ANTHROPIC_API_KEY` | None; select another embedding provider |
| `google` | Native Gemini Developer API; `GOOGLE_API_KEY` or `GEMINI_API_KEY` | `gemini-embedding-001` |
| `mistral` | Native Mistral SDK; `MISTRAL_API_KEY` | `mistral-embed` |
| `cohere` | Native Cohere SDK; `COHERE_API_KEY` | `embed-english-v3.0` |
| `bedrock` | Native AWS Converse; `AWS_REGION` + AWS credential chain or `AWS_BEARER_TOKEN_BEDROCK` | `amazon.titan-embed-text-v2:0` |
| `azure` | Azure OpenAI; `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`; `AI_MODEL` is your deployment name | Set `AI_EMBEDDING_MODEL` to your embedding deployment |
| `groq` | Provider's chat API; `GROQ_API_KEY` | Explicit configuration required |
| `together` | Provider's chat API; `TOGETHER_API_KEY` | Explicit configuration required |
| `fireworks` | Provider's chat API; `FIREWORKS_API_KEY` | Explicit configuration required |
| `openrouter` | Provider's chat API; `OPENROUTER_API_KEY` | Explicit configuration required |
| `deepseek` | Provider's chat API; `DEEPSEEK_API_KEY` | Select another embedding provider |
| `xai` | Provider's chat API; `XAI_API_KEY` | Select another embedding provider |
| `cerebras` | Provider's chat API; `CEREBRAS_API_KEY` | Select another embedding provider |
| `huggingface` | Inference Providers chat router; `HF_TOKEN` | Select another embedding provider |
| `nvidia` | Hosted NIM chat API; `NVIDIA_API_KEY` | Explicit configuration required |

Example: Claude for text, Ollama for local embeddings:

```dotenv
AI_PROVIDER=anthropic
AI_MODEL=your-claude-model-id
ANTHROPIC_API_KEY=your-anthropic-key
AI_EMBEDDING_PROVIDER=ollama
AI_EMBEDDING_MODEL=nomic-embed-text
```

For Gemini, select `AI_PROVIDER=google`, `AI_MODEL=your-gemini-model-id`, and `GOOGLE_API_KEY=...`. For AWS, use a Converse-compatible model ID or inference profile in `AI_MODEL`, set `AWS_REGION`, and configure environment credentials, an AWS profile, or an IAM role. Bedrock credentials are resolved by the AWS SDK at request time. For Azure set the resource endpoint (e.g. `https://your-resource.openai.azure.com`) and deployment name; `AZURE_OPENAI_API_VERSION` defaults to `2024-10-21` and can be overridden.

## Other local servers

These presets use the servers' documented chat-completion interfaces. Install/start the server and load your models yourself.

| `AI_PROVIDER` | Default `AI_BASE_URL` | Server configuration |
| --- | --- | --- |
| `vllm` | `http://127.0.0.1:8000/v1` | Enable auto tool choice and the parser/chat template appropriate to the model |
| `llamacpp` | `http://127.0.0.1:8080/v1` | `llama-server` with a tool-capable chat template (often `--jinja`); use the served model alias |
| `localai` | `http://127.0.0.1:8080/v1` | Load a chat model with functions/tools enabled |
| `lmstudio` | `http://127.0.0.1:1234/v1` | Start its local server and load a tool-capable model; LM Studio has its own licensing |
| `openai-compatible` | Must set explicitly | Generic compatible gateways and custom deployments |

Example with vLLM and independent native Ollama embeddings:

```dotenv
AI_PROVIDER=vllm
AI_BASE_URL=http://127.0.0.1:8000/v1
AI_MODEL=your-served-model-alias
AI_EMBEDDING_PROVIDER=ollama
AI_EMBEDDING_MODEL=nomic-embed-text
```

Loopback servers can run without a key. Set `AI_API_KEY` if your server requires one. Non-loopback endpoints require a key. Ollama URLs use the server root; compatible URLs include `/v1` (or the provider's equivalent). Override any preset with `AI_BASE_URL`.

## Models, vision, and search

- `AI_MODEL` supplies the default text model. Override tasks with `AI_CHAT_MODEL`, `AI_RECIPE_MODEL`, `AI_ENRICHMENT_MODEL`, or `AI_TRANSLATION_MODEL`.
- Set `AI_VISION_MODEL` to enable photo analysis with a vision-capable model on the **same provider**. OpenAI retains its existing vision default. A text-only model cannot analyze photos.
- Choose a chat model/server that supports tools and JSON. Provider support does not guarantee that every model supports every feature. Simple completion-only models cannot run the ReAct agent. No silent fallback sends your requests to another provider.
- Embeddings are independent: use `AI_EMBEDDING_PROVIDER`, `AI_EMBEDDING_MODEL`, `AI_EMBEDDING_BASE_URL`, and `AI_EMBEDDING_API_KEY`. Supported native embedding APIs are OpenAI, Gemini, Ollama, Mistral, Cohere, Bedrock, and Azure; compatible embedding endpoints work when the server provides them. Chat-only providers default to semantic retrieval disabled. Set `AI_EMBEDDING_PROVIDER=disabled` to disable it explicitly.
- Changing the embedding provider, endpoint, region, or model selects a separate set of vector tables. Existing data is preserved; run `npm run sync:recipes` to index saved recipes in the new space. Private corpus data must be ingested again. Caches warm naturally. Use a new model alias when replacing weights under an existing alias.
- Optional image **generation** and transcription retain their separate `OPENAI_API_KEY` integration. They are not prerequisites for chat, recipes, meal plans, or local embeddings. This change does not implement every provider's media-generation APIs.

The application code is MIT licensed regardless of which inference service you select. Hosted services, model weights, and other dependencies have their own terms. Ollama, vLLM, llama.cpp and LocalAI offer open-source inference runtimes; choose appropriately licensed weights if you want an open-source model. SpacetimeDB retains its upstream licensing terms, so do not describe every component of the stack as MIT or OSI-licensed.

## Validation and API references

`npm test` runs real SDK adapters and a LangGraph tool execution loop against local protocol fixtures for all eight transports, plus native query/document embedding tests. These offline tests check request/response integration; they do not verify paid account access, every model, model quality, GPU behavior, or every server version. No cloud keys or model downloads are needed for the tests.

- [LangChain native model integrations](https://docs.langchain.com/oss/javascript/integrations/chat)
- [Gemini embeddings](https://ai.google.dev/api/embeddings)
- [Ollama API](https://docs.ollama.com/api)
- [vLLM serving](https://docs.vllm.ai/en/latest/serving/online_serving/)
- [llama.cpp server](https://github.com/ggml-org/llama.cpp/tree/master/tools/server)
- [LocalAI functions and tools](https://localai.io/docs/features/openai-functions/)
- [Groq compatibility](https://console.groq.com/docs/openai), [Together compatibility](https://docs.together.ai/docs/inference/openai-compatibility), [Fireworks compatibility](https://docs.fireworks.ai/tools-sdks/openai-compatibility)
- [OpenRouter API](https://openrouter.ai/docs/api_reference/overview), [DeepSeek API](https://api-docs.deepseek.com/), [Hugging Face chat](https://huggingface.co/docs/inference-providers/tasks/chat-completion), [NVIDIA chat](https://docs.api.nvidia.com/nim/reference/llm-apis)
