const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');

const { Client } = require('@notionhq/client');
const { NotionToMarkdown } = require('notion-to-md');

const app = express();
app.use(cors());

const notion = new Client({
  auth: process.env.NOTION_INTEGRATION_KEY
});
const n2m = new NotionToMarkdown({ notionClient: notion });

const workDatabaseId = process.env.NOTION_WORK_DATABASE_ID;
const blogDatabaseId = process.env.NOTION_BLOG_DATABASE_ID;

function formatBlogObject(blog) {
  return {
    id: blog.id,
    title: blog.properties['Title'].title[0].plain_text,
    category: blog.properties['Category'].select.name,
    status: blog.properties['Status'].status.name,
    featured: blog.properties['Featured'].checkbox,
    publishDate: blog.properties['Publish Date'].date.start,
    tags: blog.properties['Tags'].multi_select.map((tag) => tag.name),
    authorId: blog.properties['Author'].people[0]?.id || null,
    coverImage: blog.cover?.external?.url || null
  };
}

function formatWorkObject(pageData) {
  return {
    id: pageData.id,
    projectName: pageData.properties['Project Name'].title[0].plain_text,
    client: pageData.properties['Client'].rich_text[0].plain_text,
    role: pageData.properties['Role'].rich_text[0].plain_text,
    duration: pageData.properties['Duration'].rich_text[0].plain_text,
    category: pageData.properties['Category'].select.name,
    status: pageData.properties['Status'].status.name,
    technologies: pageData.properties['Technologies'].multi_select.map(
      (tech) => tech.name
    ),
    website: pageData.properties['Website'].url,
    images: pageData.properties['Images'].files.map(
      (file) => file.external.url
    ),
    year: pageData.properties['Year'].number,
    description: pageData.properties['Description'].rich_text[0].plain_text,
    coverImage: pageData.cover?.external.url
  };
}

app.get('/portfolio/blog', async (req, res) => {
  try {
    const queryParams = req.query;

    const filter = {
      and: [
        {
          property: 'Status',
          status: {
            equals: 'Published'
          }
        }
      ]
    };

    if (queryParams.category) {
      filter.and.push({
        property: 'Category',
        select: {
          equals: queryParams.category
        }
      });
    }

    if (queryParams.tag) {
      filter.and.push({
        property: 'Tags',
        multi_select: {
          contains: queryParams.tag
        }
      });
    }

    const response = await notion.databases.query({
      database_id: blogDatabaseId,
      filter
    });

    const results = response.results?.map(formatBlogObject);

    res.json(results);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.get('/portfolio/blog/metadata', async (req, res) => {
  try {
    const response = await notion.databases.retrieve({
      database_id: blogDatabaseId
    });

    const categories = response.properties['Category'].select.options.map(
      (option) => option.name
    );

    const tags = response.properties['Tags'].multi_select.options.map(
      (option) => option.name
    );

    res.json({ tags, categories });
  } catch (error) {
    res.status(500).send(error);
  }
});

app.get('/portfolio/blog/:id', async (req, res) => {
  const postId = req.params.id;

  try {
    const page = await notion.pages.retrieve({ page_id: postId });

    if (page.properties.Status.status === 'Draft') {
      res.status(404).send('Not Found');
      return;
    }

    const formattedPage = formatBlogObject(page);

    const mdblocks = await n2m.pageToMarkdown(postId);
    const mdString = n2m.toMarkdownString(mdblocks);

    res.json({
      ...formattedPage,
      content: mdString
    });
  } catch (error) {
    res.status(500).send(error);
  }
});

app.get('/portfolio/work', async (req, res) => {
  try {
    const response = await notion.databases.query({
      database_id: workDatabaseId,
      filter: {
        property: 'Status',
        status: {
          equals: 'Published'
        }
      }
    });

    const results = response.results?.map(formatWorkObject);

    res.json(results);
  } catch (error) {
    console.log(error);
    res.status(500).send(error);
  }
});

app.get('/portfolio/work/:id', async (req, res) => {
  try {
    const pageId = req.params.id;

    if (!pageId) {
      res.status(400).send('Missing page ID');
      return;
    }

    const page = await notion.pages.retrieve({ page_id: pageId });

    if (page.properties.Status.status === 'Draft') {
      res.status(404).send('Not Found');
      return;
    }

    const workObject = formatWorkObject(page);

    const mdblocks = await n2m.pageToMarkdown(pageId);
    const mdString = n2m.toMarkdownString(mdblocks);

    res.json({
      ...workObject,
      content: mdString
    });
  } catch (error) {
    console.log(error);
    res.status(500).send(error);
  }
});

module.exports.handler = serverless(app);

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Local server running at http://localhost:${port}`);
  });
}
