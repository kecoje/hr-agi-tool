import * as ffmpeg from 'fluent-ffmpeg';

const convertMp4ToMp3 = (inputFilePath: string, outputFilePath: string) => {
  return new Promise<void>((resolve, reject) => {
    ffmpeg(inputFilePath)
      .output(outputFilePath)
      .audioCodec('libmp3lame')
      .on('end', () => resolve())
      .on('error', (err: any) => reject(err))
      .run();
  });
};

// Usage example
const inputFilePath = 'assets/zp_p9.mp4';
const outputFilePath = 'assets/zp_p9.mp3';

convertMp4ToMp3(inputFilePath, outputFilePath)
  .then(() => {
    console.log('Conversion completed successfully.');
  })
  .catch((err) => {
    console.error('An error occurred during conversion:', err);
  });
