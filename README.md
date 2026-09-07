# Sing It Backwards

A dependency-free two-player browser game: one player records an original line, the other learns its reversed phonetics and sings them back.

Try it at [dbalabka.github.io/sing-it-backwards](https://dbalabka.github.io/sing-it-backwards/).

## Run locally

Serve this directory over HTTPS or localhost (microphone access requires a secure context), for example:

```sh
npx serve .
```

## Privacy and storage

Both player recordings are stored as Blobs in the browser's IndexedDB. The recording-length and explicit appearance choices are saved in `localStorage`. Nothing is sent to a server.

## Deploy

The included GitHub Actions workflow deploys the root static site to GitHub Pages on every push to `main`. In the repository settings, choose **GitHub Actions** as the Pages source.
