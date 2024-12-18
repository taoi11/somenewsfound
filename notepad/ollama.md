Here's a distilled technical reference guide for the Ollama API:

# Ollama API Quick Reference

## Base URL
`http://localhost:11434/api`

## Model Naming Convention
- Format: `model:tag` 
- Example: `llama3:7b` or `orca-mini:3b-q4_1`
- Tag is optional (defaults to `latest`)

## Core Endpoints

### 1. Generate (/api/generate)
```json
{
  "model": "model_name",      // required
  "prompt": "your prompt",    // required
  "stream": true,            // optional, default true
  "format": "json",          // optional, for structured output
  "options": {               // optional
    "temperature": 0.7,
    "seed": 123,
    // other model parameters
  },
  "context": [1,2,3]        // optional, for conversation memory
}
```

### 2. Chat (/api/chat)
```json
{
  "model": "model_name",
  "messages": [
    {
      "role": "user|assistant|system",
      "content": "message content",
      "images": ["base64_image"]  // optional
    }
  ],
  "stream": true,
  "format": "json",
  "options": {}
}
```

### 3. Embeddings (/api/embed)
```json
{
  "model": "model_name",
  "input": "text" | ["text1", "text2"],
  "options": {}
}
```

### 4. Model Management
- Create: `POST /api/create`
- List: `GET /api/tags`
- Show: `POST /api/show`
- Copy: `POST /api/copy`
- Delete: `DELETE /api/delete`
- Pull: `POST /api/pull`
- Push: `POST /api/push`
- Running Models: `GET /api/ps`

## Common Model Parameters
```json
{
  "temperature": 0.7,
  "top_k": 20,
  "top_p": 0.9,
  "seed": 123,
  "num_predict": 100,
  "stop": ["\n", "user:"],
  "num_ctx": 1024,
  "num_thread": 8
}
```

## Response Metrics
```json
{
  "total_duration": 1234567,
  "load_duration": 123456,
  "prompt_eval_count": 25,
  "prompt_eval_duration": 123456,
  "eval_count": 100,
  "eval_duration": 123456
}
```

## Duration Notes
- All durations are in nanoseconds
- Calculate tokens/second: `eval_count / eval_duration * 10^9`

## Common Headers
- Content-Type: `application/json`
- Accept: `application/json`

Would you like me to create detailed Markdown diagrams for any specific aspect of this API?