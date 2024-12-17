-- Sources table
create table sources ( -- part of init check
  id bigint primary key generated always as identity,
  url text not null unique,
  channel_name text not null unique,
  articles_table text not null unique
);

-- News topics table
create table news_topics ( -- part of init check
  id bigint primary key generated always as identity,
  topic_name text not null,
  last_updated date,
  topic_description text,
);

-- Example articles table
create table articles_table (
  id bigint primary key generated always as identity,
  title text not null,
  url text not null,
  content text,
  summary text,
  date_added date not null,
  scrape_check integer,
  topic_id bigint references news_topics (id)
);