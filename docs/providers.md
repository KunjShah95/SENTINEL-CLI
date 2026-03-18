# AI Providers Reference

Sentinel supports multiple LLM providers:
- OpenAI
- Google Gemini
- Groq
- Anthropic
- OpenRouter

## Environment Variables

| Provider | Variable | Mode |
|----------|----------|------|
| OpenAI | `OPENAI_API_KEY` | Direct |
| Google Gemini | `GEMINI_API_KEY` | Direct |
| Groq | `GROQ_API_KEY` | Direct |
| Anthropic | `ANTHROPIC_API_KEY` | Direct |
| OpenRouter | `OPENROUTER_API_KEY` | Proxy |

## Configuring via CLI

```bash
# Configure interactively
sentinel auth

# Choose specific models
sentinel models --enable openai,gemini
```
