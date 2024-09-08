require("dotenv").config();
const Groq = require("groq-sdk");
const { ElevenLabsClient, ElevenLabs } = require("elevenlabs");
const fal = require("@fal-ai/serverless-client");
const fs = require("fs").promises;
const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);

// Initialize clients
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const elevenLabsClient = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

async function generateScript(prompt) {
  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content:
          "You are a creative scriptwriter. Write a 2-3 minute script based on the given prompt. Include scene descriptions and character dialogues.",
      },
      { role: "user", content: prompt },
    ],
    model: "mixtral-8x7b-32768",
  });
  return completion.choices[0]?.message?.content || "";
}

async function generateImage(description) {
  fal.config({
    credentials: process.env.FAF_API_KEY,
  });
  const result = await fal.subscribe("fal-ai/lora", {
    input: {
      model_name: "stabilityai/stable-diffusion-xl-base-1.0",
      prompt: description,
    },
    logs: true,
  });
  return result.images[0].url; // Assuming the API returns an image URL
}

async function generateAudio(text, voiceId) {
  const audio = await elevenLabsClient.textToSpeech.convert(voiceId, {
    optimize_streaming_latency: ElevenLabs.OptimizeStreamingLatency.Zero,
    output_format: ElevenLabs.OutputFormat.Mp32205032,
    text: text,
    voice_settings: {
      stability: 0.1,
      similarity_boost: 0.3,
      style: 0.2,
    },
  });
  return audio; // This should be a buffer or a path to the saved audio file
}

async function createVideo(images, audioFiles) {
  // This is a simplified version. You'd need to adjust this based on your exact requirements
  const imageList = images
    .map((img, i) => `file '${img}'\nduration 5`)
    .join("\n");
  await fs.writeFile("image_list.txt", imageList);

  const audioList = audioFiles.join("|");

  await execPromise(
    `ffmpeg -f concat -i image_list.txt -i "${audioList}" -c:v libx264 -c:a aac -strict experimental output.mp4`
  );

  return "output.mp4";
}

async function parseScript(script) {
  // This is a simplified parser. You'd need to enhance this based on your script format
  const scenes = script.split("\n\n").map((scene) => {
    const [description, ...dialogues] = scene.split("\n");
    return { description, dialogues };
  });
  return scenes;
}

async function main() {
  const prompt = "Write a short script about a magical forest adventure";

  console.log("Generating script...");
  const script = await generateScript(prompt);
  console.log("Script generated.");

  const scenes = await parseScript(script);

  const images = [];
  const audioFiles = [];

  for (const scene of scenes) {
    console.log(`Generating image for scene: ${scene.description}`);
    const imageUrl = await generateImage(scene.description);
    images.push(imageUrl);

    for (const dialogue of scene.dialogues) {
      console.log(`Generating audio for dialogue: ${dialogue}`);
      const audio = await generateAudio(dialogue, "pMsXgVXv3BLzUgSXRplE"); // Using a default voice ID
      audioFiles.push(audio);
    }
  }

  console.log("Creating video...");
  const videoPath = await createVideo(images, audioFiles);
  console.log(`Video created: ${videoPath}`);
}

main().catch(console.error);
