import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const postSchema = z.object({
  title: z.string(),
  date: z.coerce.date(),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  mediumUrl: z.url().optional(),
  draft: z.boolean().default(false),
});

const postLoader = (dir: string) =>
  glob({ pattern: "**/*.{md,mdx}", base: `./src/content/${dir}` });

export const collections = {
  blog: defineCollection({ loader: postLoader("blog"), schema: postSchema }),
  ouatrevisit: defineCollection({
    loader: postLoader("ouatrevisit"),
    schema: postSchema,
  }),
  elections: defineCollection({
    loader: postLoader("elections"),
    schema: postSchema,
  }),
};
