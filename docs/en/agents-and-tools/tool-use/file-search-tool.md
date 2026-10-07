---
title: File search tool
status: Proposal mock for a take-home assignment, AI-generated. Not Anthropic documentation and not a live API.
description: Let Claude search collections of files you've uploaded with the Files API and answer with cited passages.
---

<Note>
  File search is in beta. Include the beta header `anthropic-beta: file-search-2026-10-05` in Collections API requests and in Messages requests that use the tool. File search is not eligible for [zero data retention (ZDR)](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention).
</Note>

The file search tool lets Claude find the passages it needs across documents you've uploaded with the [Files API](https://platform.claude.com/docs/en/build-with-claude/files). You add files to a **collection**, Anthropic processes and indexes them, and Claude searches the collection during a Messages request. Use it to build a knowledge assistant or support bot on documents already stored with Claude, without operating a separate retrieval system.

One version of the file search tool is available:

* `file_search_20261005`: semantic and keyword search with reranking over one or more collections

<Note>
  During the beta, file search is available on the Claude API only. It is not available on Claude Platform on AWS, Microsoft Foundry, Amazon Bedrock, or Google Cloud.
</Note>

## How file search works

When you add the file search tool to your API request:

1. Claude determines when to search based on the prompt and forms a search query.
2. The API searches the collections you listed and loads only the most relevant passages into Claude's context, up to the `max_results` and `max_result_tokens` limits you set. Each passage carries the ID of the file it came from.
3. At the end of its turn, Claude provides a final response with citations to the passages it used.

### How collections are indexed

When you add a file to a collection, Anthropic:

1. Extracts the file's text and splits it into passages.
2. Adds a short, document-specific context to each passage, following the [Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval) method, so the passage stays findable outside its original document. The collection's pinned Claude Haiku model writes this context; new collections use Claude Haiku 4.5.
3. Embeds each passage with the collection's Voyage AI embedding model and builds a keyword (BM25) index over the passages.

At search time, file search combines semantic and keyword matches from every listed collection and reranks them, so the passages Claude receives are the most relevant across all of them.

A collection pins its embedding model, its Claude Haiku model, and its indexing settings when you create it, and they never change for that collection. To use a different embedding model, create a new collection from the same file IDs; you don't upload anything again. Voyage AI models run within the Claude Platform, so you don't need a Voyage account or API key. Indexing runs asynchronously; see [Check indexing status](#check-indexing-status).

### When to use file search

| Approach | Use it when |
| --- | --- |
| [Document blocks](https://platform.claude.com/docs/en/build-with-claude/files#document-blocks) with a `file_id` | You know which files matter and they fit in the context window, for example to summarize a whole document |
| File search tool | Claude needs to find the relevant passages across a larger set of documents |
| [Search results](https://platform.claude.com/docs/en/build-with-claude/search-results) | You already operate a retrieval system and want Claude to cite its results |

File search and document blocks work together. After a search identifies the right file, your application can pass that `file_id` as a document block in a follow-up request, within the model's context window.

## How to use file search

### Create a collection

Upload documents with the [Files API](https://platform.claude.com/docs/en/build-with-claude/files#uploading-a-file), then create a collection from their file IDs. `embedding_model` is optional and defaults to `voyage-4`. The response shows the selected model, which stays fixed for that collection.

<CodeGroup>
  ```bash cURL
  curl https://api.anthropic.com/v1/collections \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "anthropic-beta: file-search-2026-10-05" \
    -H "content-type: application/json" \
    -d '{
      "name": "Support docs",
      "embedding_model": "voyage-4",
      "file_ids": ["file_001", "file_002"]
    }'
  ```

  ```python Python
  import anthropic

  client = anthropic.Anthropic()

  collection = client.beta.collections.create(
      name="Support docs",
      embedding_model="voyage-4",
      file_ids=["file_001", "file_002"],
      betas=["file-search-2026-10-05"],
  )
  print(collection.id, collection.status)
  ```

  ```typescript TypeScript
  import Anthropic from "@anthropic-ai/sdk";

  const client = new Anthropic();

  const collection = await client.beta.collections.create({
    name: "Support docs",
    embedding_model: "voyage-4",
    file_ids: ["file_001", "file_002"],
    betas: ["file-search-2026-10-05"]
  });

  console.log(collection.id, collection.status);
  ```
</CodeGroup>

The API returns `201 Created`:

```json Response
{
  "id": "col_123",
  "name": "Support docs",
  "embedding_model": "voyage-4",
  "status": "indexing",
  "documents": [
    {"id": "doc_123", "file_id": "file_001", "status": "indexing"},
    {"id": "doc_124", "file_id": "file_002", "status": "indexing"}
  ]
}
```

Each entry in `documents` is a **collection document**: the collection's record of one file. Use its `id` to check or remove that file's entry later. A create request accepts up to 100 file IDs; if any ID doesn't exist in the workspace or has expired, the request fails and no collection is created. You can also create an empty collection and add files later.

Collection names don't have to be unique, and the SDKs retry a request that times out, so a create that timed out may still have made a collection. Before you create it again, check `GET /v1/collections`, or turn off retries for the create request.

### Add a document

To add another document later, add an existing file ID to the collection. This queues indexing without uploading the file again.

<CodeGroup>
  ```bash cURL
  curl https://api.anthropic.com/v1/collections/col_123/documents \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "anthropic-beta: file-search-2026-10-05" \
    -H "content-type: application/json" \
    -d '{"file_id": "file_003"}'
  ```

  ```python Python
  document = client.beta.collections.documents.create(
      "col_123",
      file_id="file_003",
      betas=["file-search-2026-10-05"],
  )
  print(document.id, document.status)
  ```

  ```typescript TypeScript
  const document = await client.beta.collections.documents.create("col_123", {
    file_id: "file_003",
    betas: ["file-search-2026-10-05"]
  });

  console.log(document.id, document.status);
  ```
</CodeGroup>

The API returns `202 Accepted`:

```json Response
{
  "id": "doc_125",
  "collection_id": "col_123",
  "file_id": "file_003",
  "status": "indexing"
}
```

The add response confirms the document ID, collection ID, file ID, and indexing status. Retrieve the document to inspect the full indexing state:

| Field | Description |
| --- | --- |
| `file_id` | The file this document indexes. It never changes, and it stays on failed documents so you know which file to fix |
| `status` | `indexing` while an indexing attempt is queued or running, then `ready` or `failed` |
| `active` | The indexed content that searches use: `file_id` and `revision`. `null` until indexing succeeds |
| `pending` | Indexing work in progress: `file_id`, `revision`, and `state` (`queued`, then `indexing`). `null` when nothing is in progress |
| `error` | Present when `status` is `failed`: an object with `type` and `message` |

`revision` counts indexing attempts for the document. It starts at `1` and increases only when you [retry a failed document](#retry-a-failed-document). A document always points to the same file; to index a new version of a document, add the new file and remove the old document, as described in [Update documents](#update-documents).

Adding a file that's already in the collection returns a 409 `conflict_error`. The SDKs retry some failed requests automatically, so you can get this error after an earlier attempt succeeded. If you do, list the collection's documents with the `file_id` filter to find the existing document.

### Check indexing status

Indexing runs asynchronously. Retrieve a document until its status is `ready` or `failed`:

<CodeGroup>
  ```bash cURL
  curl https://api.anthropic.com/v1/collections/col_123/documents/doc_125 \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "anthropic-beta: file-search-2026-10-05"
  ```

  ```python Python
  import time

  while True:
      document = client.beta.collections.documents.retrieve(
          "doc_125",
          collection_id="col_123",
          betas=["file-search-2026-10-05"],
      )
      if document.status != "indexing":
          break
      time.sleep(5)
  print(document.status)
  ```

  ```typescript TypeScript
  let document = await client.beta.collections.documents.retrieve("doc_125", {
    collection_id: "col_123",
    betas: ["file-search-2026-10-05"]
  });
  while (document.status === "indexing") {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    document = await client.beta.collections.documents.retrieve("doc_125", {
      collection_id: "col_123",
      betas: ["file-search-2026-10-05"]
    });
  }

  console.log(document.status);
  ```
</CodeGroup>

```json Response
{
  "id": "doc_125",
  "collection_id": "col_123",
  "file_id": "file_003",
  "status": "ready",
  "active": {"file_id": "file_003", "revision": 1},
  "pending": null
}
```

To check a whole collection, retrieve it with `GET /v1/collections/{collection_id}`. Its `status` is `indexing` while any document is queued or indexing and `ready` otherwise, and `document_counts` shows how many documents are in each state:

```json Response
{
  "id": "col_123",
  "name": "Support docs",
  "embedding_model": "voyage-4",
  "status": "ready",
  "document_counts": {"indexing": 0, "ready": 3, "failed": 0}
}
```

Searches use only documents whose status is `ready`. You can search a collection while other documents are still indexing; those documents are skipped until they finish. A failed document is excluded from search, and the rest of the collection remains usable.

To find failed documents, list them with `GET /v1/collections/{collection_id}/documents?status=failed`. For example, a scanned PDF without a text layer fails:

```json Response
{
  "data": [
    {
      "id": "doc_127",
      "collection_id": "col_123",
      "file_id": "file_005",
      "status": "failed",
      "active": null,
      "pending": null,
      "error": {
        "type": "no_extractable_text",
        "message": "The PDF has no extractable text. Scanned PDFs are not supported."
      }
    }
  ],
  "next_page": null
}
```

These are the possible indexing error types:

* `no_extractable_text`: The PDF has no text layer
* `unsupported_file_type`: The file isn't plain text or a PDF
* `file_deleted`: The file was deleted from the Files API
* `file_expired`: The file reached its `expires_at` time
* `indexing_error`: Indexing couldn't finish because of an internal error. [Retry the document](#retry-a-failed-document)

#### Retry a failed document

If a document fails with `indexing_error`, retry it with `POST /v1/collections/{collection_id}/documents/{document_id}/retry`. The document keeps its ID and returns to `indexing` with the next `revision` in `pending`. The other error types need a different file: remove the document and add a corrected file instead.

### Search a collection

Once indexing is complete, provide the file search tool in your Messages request with the collections Claude can search:

<CodeGroup>
  ```bash cURL
  curl https://api.anthropic.com/v1/messages \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "anthropic-beta: file-search-2026-10-05" \
    -H "content-type: application/json" \
    -d '{
      "model": "claude-opus-5-5",
      "max_tokens": 1024,
      "messages": [
        {
          "role": "user",
          "content": "An upgrade failed. How do I restore the previous release? Cite the instructions."
        }
      ],
      "tools": [{
        "type": "file_search_20261005",
        "name": "file_search",
        "collection_ids": ["col_123"],
        "max_results": 5,
        "max_result_tokens": 4000,
        "max_uses": 1
      }]
    }'
  ```

  ```python Python
  response = client.beta.messages.create(
      model="claude-opus-5-5",
      max_tokens=1024,
      messages=[
          {
              "role": "user",
              "content": "An upgrade failed. How do I restore the previous release? Cite the instructions.",
          }
      ],
      tools=[
          {
              "type": "file_search_20261005",
              "name": "file_search",
              "collection_ids": ["col_123"],
              "max_results": 5,
              "max_result_tokens": 4000,
              "max_uses": 1,
          }
      ],
      betas=["file-search-2026-10-05"],
  )
  print(response)
  ```

  ```typescript TypeScript
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: "An upgrade failed. How do I restore the previous release? Cite the instructions."
      }
    ],
    tools: [
      {
        type: "file_search_20261005",
        name: "file_search",
        collection_ids: ["col_123"],
        max_results: 5,
        max_result_tokens: 4000,
        max_uses: 1
      }
    ],
    betas: ["file-search-2026-10-05"]
  });

  console.log(response);
  ```
</CodeGroup>

Claude forms a search query, and file search loads only the most relevant passages into its context to answer. With `max_uses: 1`, Claude searches at most once and answers from at most five passages totaling no more than 4,000 tokens.

<Warning>
  **Collections are accessible to your entire workspace, not scoped to an end user.** Any API key with access to a workspace can search any collection in it, the same as [uploaded files](https://platform.claude.com/docs/en/build-with-claude/files#how-the-files-api-works). A collection ID is not an access control. If your application serves several end users or tenants, confirm that the current user may read a collection before you include its ID in a request, and never accept collection IDs from untrusted input.
</Warning>

## Tool definition

The file search tool supports the following parameters:

```json JSON
{
  "type": "file_search_20261005",
  "name": "file_search",

  // Required: The collections Claude can search in this request
  "collection_ids": ["col_123"],

  // Optional: Maximum passages returned by each search (default 5, up to 20)
  "max_results": 5,

  // Optional: Maximum tokens of passage text returned by each search (default 4,000, from 1,000 to 16,000)
  "max_result_tokens": 4000,

  // Optional: Limit the number of searches per request
  "max_uses": 1
}
```

### Collection IDs

List between 1 and 10 collections. Each ID in `collection_ids` must belong to the workspace the request runs in. If a collection doesn't exist in that workspace, the API returns a 400 `invalid_request_error`. Claude searches across all listed collections and receives the most relevant passages from any of them, even when the collections use different embedding models.

### Max results and max result tokens

`max_results` and `max_result_tokens` apply to each search. File search adds passages in order of relevance until the next passage would exceed either limit, so a search can return fewer passages than `max_results`. Passages are returned whole, never truncated, so every citation points to complete passage text. A passage is at most 800 tokens, so the smallest allowed `max_result_tokens` always fits the most relevant passage.

If a file is in more than one of the listed collections, each of its passages appears at most once in a search's results.

### Max uses

The `max_uses` parameter limits the number of searches performed. If Claude attempts more searches than allowed, the `file_search_tool_result` is an error with the `max_uses_exceeded` error code.

### Requiring a search

By default, Claude decides whether to search. On models that support [forced tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools#forcing-tool-use), set `tool_choice` to `{"type": "tool", "name": "file_search"}` to require a search before Claude answers. Some models, including Claude Opus 5.5, don't support forced tool use; with those models, ask for a search in the prompt.

## Response

Here's an example response structure:

```json Output
{
  "role": "assistant",
  "content": [
    // 1. Claude's decision to search
    {
      "type": "text",
      "text": "I'll search the support docs for how to restore a previous release."
    },
    // 2. The search query used
    {
      "type": "server_tool_use",
      "id": "srvtoolu_01Hq4L6vR8tW2nYxK3pZ9aBc",
      "name": "file_search",
      "input": {
        "query": "restore previous release after failed upgrade"
      }
    },
    // 3. Retrieved passages
    {
      "type": "file_search_tool_result",
      "tool_use_id": "srvtoolu_01Hq4L6vR8tW2nYxK3pZ9aBc",
      "content": [
        {
          "type": "search_result",
          "source": "file_001",
          "title": "upgrade-guide.pdf",
          "content": [
            {
              "type": "text",
              "text": "If an upgrade fails, open Releases, select the most recent release marked Successful, and choose Restore. Restoring returns the application to that release without deleting customer data."
            }
          ],
          "citations": { "enabled": true }
        },
        {
          "type": "search_result",
          "source": "file_002",
          "title": "troubleshooting.txt",
          "content": [
            {
              "type": "text",
              "text": "Before you restore a release, download the upgrade log from Releases > Failed upgrade > Logs. Support needs this log to find the cause of the failure."
            }
          ],
          "citations": { "enabled": true }
        }
      ]
    },
    // 4. Claude's response with citations
    {
      "type": "text",
      "text": "Open Releases, select the most recent release marked Successful, and choose Restore. This returns the application to that release without deleting customer data.",
      "citations": [
        {
          "type": "search_result_location",
          "source": "file_001",
          "title": "upgrade-guide.pdf",
          "cited_text": "If an upgrade fails, open Releases, select the most recent release marked Successful, and choose Restore. Restoring returns the application to that release without deleting customer data.",
          "search_result_index": 0,
          "start_block_index": 0,
          "end_block_index": 1
        }
      ]
    },
    {
      "type": "text",
      "text": " Before you restore, download the upgrade log from Releases > Failed upgrade > Logs so support can find the cause.",
      "citations": [
        {
          "type": "search_result_location",
          "source": "file_002",
          "title": "troubleshooting.txt",
          "cited_text": "Before you restore a release, download the upgrade log from Releases > Failed upgrade > Logs. Support needs this log to find the cause of the failure.",
          "search_result_index": 1,
          "start_block_index": 0,
          "end_block_index": 1
        }
      ]
    }
  ],
  "id": "msg_01XgRt7bN4kPq2Wm8sVc5LdE",
  "usage": {
    "input_tokens": 2954,
    "output_tokens": 386,
    "server_tool_use": {
      "file_search_requests": 1
    }
  },
  "stop_reason": "end_turn"
}
```

### Search results

Each search returns a list of [`search_result`](https://platform.claude.com/docs/en/build-with-claude/search-results#search-result-schema) blocks, the same format you use when you supply search results yourself:

* `source`: The ID of the file the passage came from
* `title`: The file's name
* `content`: The passage text, as one or more text blocks

Passage text is the original text of the document. The context added during indexing helps search find the passage but is never returned or cited. To find the collection document for a result, list the documents of each collection you searched with the `file_id` filter set to the result's `source`.

To continue a conversation that contains file search results, send the assistant's content blocks back exactly as you received them. Retrieved passages count as input tokens in the turn that retrieved them and in later turns.

### Citations

File search extends the Messages API's existing citation support: instead of supplying individual files or search results, you reference a collection and Claude returns a cited answer. Citations are always enabled for file search. Claude cites passages with the existing [`search_result_location`](https://platform.claude.com/docs/en/build-with-claude/search-results#citation-fields) citation type, so code that already handles search result citations works unchanged. Each citation includes the `source` file ID, the `title`, the `cited_text`, and the block indexes of the cited passage.

As with other search results, `search_result_index` counts every `search_result` block in order across the whole request and continues into the response: results from earlier file searches in the conversation and blocks you supply come first, then this response's file search results. In a follow-up turn, the first new passage's index is therefore the number of search results already in the request, not `0`.

When the file search tool is enabled in a request, citations must also be enabled on any `search_result` blocks you supply yourself, as with the web search tool.

### Inspect searches

Each `server_tool_use` block shows the query Claude ran, and the matching `file_search_tool_result` block shows the passages returned and the file each came from. When an answer misses a document you expected, check whether Claude searched for it and whether the file appeared in the results. If the file never appears, [check its indexing status](#check-indexing-status).

### Errors

When the file search tool encounters an error, the Claude API still returns a 200 (success) response. The error is represented within the response body using the following structure:

```json Output
{
  "type": "file_search_tool_result",
  "tool_use_id": "srvtoolu_01Hq4L6vR8tW2nYxK3pZ9aBc",
  "content": {
    "type": "file_search_tool_result_error",
    "error_code": "max_uses_exceeded"
  }
}
```

On an error, `content` is a single error object rather than a list of search results. A search that succeeds but matches no passages returns an empty `content` list, not an error.

These are the possible error codes:

* `too_many_requests`: Rate limit exceeded
* `invalid_tool_input`: Invalid search query parameter
* `max_uses_exceeded`: Maximum file search tool uses exceeded
* `query_too_long`: Query exceeds maximum length
* `unavailable`: An internal error occurred

## Update documents

Uploaded files can't be edited, so a revised document is a new file. To update a document in a collection:

1. Upload the revised document with the Files API.
2. Add its new file ID to the collection.
3. Wait until the new document's status is `ready`.
4. Remove the old document from the collection.

Until you remove the old document, searches can return passages from both versions. If the new document fails, the old one stays searchable.

<CodeGroup>
  ```bash cURL
  # 1. Upload the revised document
  curl https://api.anthropic.com/v1/files \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -F "file=@upgrade-guide.pdf"

  # 2. Add the new file to the collection
  curl https://api.anthropic.com/v1/collections/col_123/documents \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "anthropic-beta: file-search-2026-10-05" \
    -H "content-type: application/json" \
    -d '{"file_id": "file_004"}'

  # 3. Check the new document until its status is ready
  curl https://api.anthropic.com/v1/collections/col_123/documents/doc_126 \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "anthropic-beta: file-search-2026-10-05"

  # 4. Remove the old document
  curl -X DELETE https://api.anthropic.com/v1/collections/col_123/documents/doc_123 \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "anthropic-beta: file-search-2026-10-05"
  ```

  ```python Python
  import time

  betas = ["file-search-2026-10-05"]

  new_file = client.files.upload(
      file=("upgrade-guide.pdf", open("upgrade-guide.pdf", "rb"), "application/pdf"),
  )
  document = client.beta.collections.documents.create(
      "col_123",
      file_id=new_file.id,
      betas=betas,
  )

  while document.status == "indexing":
      time.sleep(5)
      document = client.beta.collections.documents.retrieve(
          document.id,
          collection_id="col_123",
          betas=betas,
      )

  if document.status == "ready":
      client.beta.collections.documents.delete(
          "doc_123",
          collection_id="col_123",
          betas=betas,
      )
  ```

  ```typescript TypeScript
  import fs from "fs";
  import { toFile } from "@anthropic-ai/sdk";

  const betas = ["file-search-2026-10-05"];

  const newFile = await client.files.upload({
    file: await toFile(fs.createReadStream("upgrade-guide.pdf"), undefined, {
      type: "application/pdf"
    })
  });
  let document = await client.beta.collections.documents.create("col_123", {
    file_id: newFile.id,
    betas
  });

  while (document.status === "indexing") {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    document = await client.beta.collections.documents.retrieve(document.id, {
      collection_id: "col_123",
      betas
    });
  }

  if (document.status === "ready") {
    await client.beta.collections.documents.delete("doc_123", {
      collection_id: "col_123",
      betas
    });
  }
  ```
</CodeGroup>

Removing a document from a collection deletes its index entries but preserves the underlying file. The file stays in the Files API until you [delete it](https://platform.claude.com/docs/en/build-with-claude/files#delete-a-file).

<Note>
  File search does not watch the system where your documents originate. Anthropic handles indexing; your application keeps the collection synchronized with its source documents by adding new files and removing outdated documents.
</Note>

## Manage collections

The Collections API manages collections and their documents:

| Endpoint | Description |
| --- | --- |
| `POST /v1/collections` | Create a collection, optionally from up to 100 existing files |
| `GET /v1/collections` | List the collections in the workspace |
| `GET /v1/collections/{collection_id}` | Get a collection's status and document counts |
| `DELETE /v1/collections/{collection_id}` | Delete a collection, its documents, and its index |
| `POST /v1/collections/{collection_id}/documents` | Add an existing file to a collection |
| `GET /v1/collections/{collection_id}/documents` | List a collection's documents; filter by `status` or `file_id` |
| `GET /v1/collections/{collection_id}/documents/{document_id}` | Get a document's indexing status and errors |
| `POST /v1/collections/{collection_id}/documents/{document_id}/retry` | Retry a document that failed with `indexing_error` |
| `DELETE /v1/collections/{collection_id}/documents/{document_id}` | Remove a document and delete its index entries |

List endpoints use the same pagination as the Files API: `limit`, `page`, and `next_page`.

Deleting returns the deleted object's ID and type, like `DELETE /v1/files/{file_id}`:

```json Response
{
  "id": "doc_123",
  "type": "collection_document_deleted"
}
```

Deletion works at three levels, and file expiration works like deleting the file:

* **Remove a document:** Searches that start after the request returns no longer see the document, and its index entries are deleted. The file stays in the Files API.
* **Delete a collection:** Deletes every document in the collection and the collection's index. The files stay in the Files API.
* **Delete a file:** Deleting a file with `DELETE /v1/files/{file_id}` also deletes its index entries in every collection. Its documents stop appearing in search results and change to `failed` with the `file_deleted` error, so you can see and remove them.
* **File expiration:** When a file reaches its [`expires_at`](https://platform.claude.com/docs/en/build-with-claude/files#file-expiration) time, its index entries in every collection are deleted the same way, and its documents change to `failed` with the `file_expired` error. Search never returns passages from an expired file, and you can't create a collection with or add an expired file.

Passages that a search already returned stay in that conversation's history; deletion affects searches that start after it.

## Supported files

File search indexes plain text files and PDFs with extractable text. A scanned PDF without a text layer fails indexing with the `no_extractable_text` error, and other file types fail with `unsupported_file_type`. Search is tuned for English content during the beta. Files must also fit within the [Files API storage limits](https://platform.claude.com/docs/en/build-with-claude/files#storage-limits).

## Usage and pricing

File search usage is charged in addition to token usage. The beta rates below will be evaluated against customer costs, willingness to pay, and operating costs before they are finalized:

```json
{
  "usage": {
    "input_tokens": 2954,
    "output_tokens": 386,
    "server_tool_use": {
      "file_search_requests": 1
    }
  }
}
```

| Item | Price |
| --- | --- |
| Document embeddings | Voyage AI's published rates, billed through Anthropic: $0.06 per million tokens for the default `voyage-4`, $0.12 for `voyage-4-large`, $0.02 for `voyage-4-lite` |
| Passage context | The collection's pinned Claude Haiku model at its standard input, output, and prompt caching [rates](https://platform.claude.com/docs/en/about-claude/pricing); Claude Haiku 4.5 for new collections |
| Index storage | $0.10 per GB of stored index per day |
| Searches | $2.50 per 1,000 successful searches, including query embedding, retrieval, and reranking |
| Retrieved passages and answers | The Messages model's standard token rates |

Embeddings and passage context are charged for each indexing attempt that succeeds, including a successful retry. Attempts that fail, for any error type, aren't charged, and Anthropic doesn't reindex a document on its own. Each successful search counts as one search regardless of the number of passages returned, and `file_search_requests` reports the successful searches in a response. Searches that return an error are not billed. Removing a document stops its storage charge. The [Console](https://platform.claude.com) shows indexing, storage, and search usage for each workspace.

## Next steps

<CardGroup cols={3}>
  <Card title="Files API" icon="book" href="https://platform.claude.com/docs/en/build-with-claude/files">
    Upload files once and reference them by file_id.
  </Card>

  <Card title="Search results" icon="link" href="https://platform.claude.com/docs/en/build-with-claude/search-results">
    Cite results from your own retrieval system.
  </Card>

  <Card title="Server tools" icon="tool" href="https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools">
    How Anthropic-executed tools run and return results.
  </Card>
</CardGroup>
