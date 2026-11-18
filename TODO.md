# PrivMeta permanent website

## Preserve the existing application

- Keep the existing Next.js App Router application, current project structure, metadata-removal workflow, supported formats, privacy explanations, blog pages, and documented limitations.
- Keep the static export configuration and deploy without a server or database.
- Keep file processing in the user's browser and do not add file uploads or server-side metadata processing.

## Prepare the managed website

- Add the required route manifest for the current page routes.
- Add durable project logo metadata without changing the user-facing brand.
- Install dependencies from the committed lockfile and verify lint and production build.
- Start the managed Preview server and verify the main routes.

## Publish

- Configure the static build command and output directory.
- Save the verified source as a canonical checkpoint.
- Publish the latest checkpoint as a permanent public static website.
