const serverless = require("serverless-http");
const express = require("express");
const { Client } = require("@notionhq/client");
const { NotionToMarkdown } = require("notion-to-md");

const app = express();

const notion = new Client({
  auth: process.env.NOTION_INTEGRATION_KEY,
});
const n2m = new NotionToMarkdown({ notionClient: notion });

const workDatabaseId = process.env.NOTION_WORK_DATABASE_ID;
const blogDatabaseId = process.env.NOTION_BLOG_DATABASE_ID;

app.get("/portfolio/blog", async (req, res) => {
  try {
    const response = await notion.databases.query({
      database_id: blogDatabaseId,
      filter: {
        property: "Status",
        status: {
          equals: "Published",
        },
      },
    });

    const results = response.results;

    res.json(results);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.get("/portfolio/blog/:id", async (req, res) => {
  const postId = req.params.id;

  try {
    const page = await notion.pages.retrieve({ page_id: postId });
    const mdblocks = await n2m.pageToMarkdown(postId);
    const mdString = n2m.toMarkdownString(mdblocks);
    res.json({ page, mdString });
  } catch (error) {
    res.status(500).send(error);
  }
});

app.get("/portfolio/work", (req, res) => {
  res.send("Work!");
});

app.get("/portfolio/work/:id", (req, res) => {
  res.send(`Work! ${req.params.id}`);
});

module.exports.handler = serverless(app);

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Local server running at http://localhost:${port}`);
  });
}
