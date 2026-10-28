let recognizer;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const { GestureRecognizer, FilesetResolver } = await import('/static/vendor/vision_bundle.mjs');
      const fileset = await FilesetResolver.forVisionTasks('/static/vendor/wasm');
      recognizer = await GestureRecognizer.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '/static/models/gesture_recognizer.task', delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
      self.postMessage({ type: 'ready' });
    } catch (error) { self.postMessage({ type: 'error', message: String(error.message || error) }); }
  } else if (data.type === 'frame') {
    try {
      if (!recognizer) throw new Error('模型尚未就緒');
      const result = recognizer.recognizeForVideo(data.frame, data.timestamp);
      self.postMessage({ type: 'result', hands: result.landmarks.map((landmarks, index) => ({
        landmarks, worldLandmarks: result.worldLandmarks[index],
      })), timestamp: data.timestamp });
    } catch (error) { self.postMessage({ type: 'error', message: String(error.message || error) }); }
    finally { data.frame.close(); }
  }
};
