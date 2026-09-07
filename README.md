# Sing It Backwards

A dependency-free browser recorder for singing a line, then hearing it played backwards.

## Run locally

Serve this directory over HTTPS or localhost (microphone access requires a secure context), for example:

```sh
npx serve .
```

## Privacy and storage

The most recent recording is stored as a Blob in the browser's IndexedDB. The recording-length choice is saved in `localStorage`. Nothing is sent to a server.

## Deploy

The included GitHub Actions workflow deploys the root static site to GitHub Pages on every push to `main`. In the repository settings, choose **GitHub Actions** as the Pages source.
