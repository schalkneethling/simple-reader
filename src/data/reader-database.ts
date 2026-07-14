import Dexie, { type EntityTable } from "dexie";

import type { Article, Feed } from "../domain/types";

export interface StoredArticle extends Article {
  ingestedAt: number;
  sortAt: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

export class ReaderDatabase extends Dexie {
  feeds!: EntityTable<Feed, "id">;
  articles!: EntityTable<StoredArticle, "id">;
  settings!: EntityTable<SettingRecord, "key">;

  constructor(name = "simple-reader") {
    super(name);

    this.version(1).stores({
      feeds: "&id,&url,addedAt,refreshedAt",
      articles: "&id,feedId,[feedId+sortAt],sortAt,readAt",
      settings: "&key",
    });

    this.version(2)
      .stores({
        feeds: "&id,&url,addedAt,refreshedAt",
        articles: "&id,feedId,[feedId+sortAt],sortAt,readAt",
        settings: "&key",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<Partial<StoredArticle>>("articles")
          .toCollection()
          .modify((article) => {
            const publishedAt = article.publishedAt ? Date.parse(article.publishedAt) : Number.NaN;
            article.starred ??= false;
            article.ingestedAt ??= Number.isFinite(publishedAt) ? publishedAt : 0;
            article.sortAt ??= article.ingestedAt;
          });
      });
  }
}
