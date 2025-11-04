const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use("/downloads", express.static(path.join(__dirname, "downloads")));

const downloadsDir = path.join(__dirname, "downloads");
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir);
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/download", (req, res) => {
  const { url, format } = req.body;
  if (!url) {
    return res
      .status(400)
      .json({ success: false, error: "URL tidak boleh kosong." });
  }

  const timestamp = Date.now();
  const outputFileName = `${timestamp}_fairus_vlogger`;
  const outputPath = path.join(downloadsDir, outputFileName);
  console.log(
    `[INFO] Memulai download untuk URL: ${url} dengan format: ${format}`
  );

  const args = [];

  if (format === "mp3") {
    args.push(
      "--audio-format",
      "mp3",
      "--extract-audio",
      "--audio-quality",
      "0",
      url,
      "-o",
      `${outputPath}.%(ext)s`
    );
  } else {
    args.push(
      "-f",
      "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
      url,
      "-o",
      `${outputPath}.%(ext)s`
    );
  }

  const ytDlp = spawn("yt-dlp", args);
  let finalFileName = "";

  ytDlp.stdout.on("data", (data) => {
    const output = data.toString();
    console.log(`[yt-dlp STDOUT]: ${output}`);
    const mergeMatch = output.match(
      /Merging formats into ".*[\\\/](.*\.(mp4|mp3))"/
    );
    if (mergeMatch && mergeMatch[1]) {
      finalFileName = mergeMatch[1];
    }
  });

  ytDlp.stderr.on("data", (data) => {
    console.error(`[yt-dlp STDERR]: ${data}`);
  });

  ytDlp.on("close", (code) => {
    if (code === 0) {
      if (!finalFileName) {
        try {
          const files = fs.readdirSync(downloadsDir);
          finalFileName = files.find((file) =>
            file.startsWith(timestamp.toString())
          );
        } catch (e) {
          console.error("[ERROR] Gagal membaca direktori.", e);
        }
      }
      if (finalFileName) {
        res.json({
          success: true,
          downloadLink: `/play/${finalFileName}`,
          type: format,
          fileName: finalFileName,
        });
      } else {
        res.status(500).json({
          success: false,
          error: "Gagal mendeteksi file hasil download.",
        });
      }
    } else {
      res.status(500).json({
        success: false,
        error: "Proses download gagal. Cek log server.",
      });
    }
  });
});

app.get("/play/:filename", (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, "downloads", filename);
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Length": stat.size,
      "Accept-Ranges": "bytes",
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.status(404).send("File tidak ditemukan.");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});
