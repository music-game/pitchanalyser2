var DEFAULT_AMDF_PARAMS = {
  sampleRate: 44100,
  minFrequency: 82,
  maxFrequency: 1000,
  ratio: 5,
  sensitivity: 0.1,
};
function AMDF(params) {
  if (params === void 0) {
    params = {};
  }
  var config = Object.assign(Object.assign({}, DEFAULT_AMDF_PARAMS), params);
  console.log(config);
  var sampleRate = config.sampleRate;
  var minFrequency = config.minFrequency;
  var maxFrequency = config.maxFrequency;
  var sensitivity = config.sensitivity;
  var ratio = config.ratio;
  var amd = [];
  /* Round in such a way that both exact minPeriod as
     exact maxPeriod lie inside the rounded span minPeriod-maxPeriod,
     thus ensuring that minFrequency and maxFrequency can be found
     even in edge cases */
  var maxPeriod = Math.ceil(sampleRate / minFrequency);
  var minPeriod = Math.floor(sampleRate / maxFrequency);
  return function AMDFDetector(float32AudioBuffer) {
    var maxShift = float32AudioBuffer.length;
    var t = 0;
    var minval = Infinity;
    var maxval = -Infinity;
    var frames1, frames2, calcSub, i, j, u, aux1, aux2;
    // Find the average magnitude difference for each possible period offset.
    for (i = 0; i < maxShift; i++) {
      if (minPeriod <= i && i <= maxPeriod) {
        for (aux1 = 0, aux2 = i, t = 0, frames1 = [], frames2 = []; aux1 < maxShift - i; t++, aux2++, aux1++) {
          frames1[t] = float32AudioBuffer[aux1];
          frames2[t] = float32AudioBuffer[aux2];
        }
        // Take the difference between these frames.
        var frameLength = frames1.length;
        calcSub = [];
        for (u = 0; u < frameLength; u++) {
          calcSub[u] = frames1[u] - frames2[u];
        }
        // Sum the differences.
        var summation = 0;
        for (u = 0; u < frameLength; u++) {
          summation += Math.abs(calcSub[u]);
        }
        amd[i] = summation;
      }
    }

    for (j = minPeriod; j < maxPeriod; j++) {
      if (amd[j] < minval) minval = amd[j];
      if (amd[j] > maxval) maxval = amd[j];
    }
    var cutoff = Math.round(sensitivity * (maxval - minval) + minval);
    for (j = minPeriod; j <= maxPeriod && amd[j] > cutoff; j++);
    var searchLength = minPeriod / 2;
    minval = amd[j];
    var minpos = j;
    for (i = j - 1; i < j + searchLength && i <= maxPeriod; i++) {
      if (amd[i] < minval) {
        minval = amd[i];
        minpos = i;
      }
    }
    //Draw scope
    let scale = scopeHeight / maxval;
    let multiple = Math.ceil(amd.length / canvasWidth);
    freqCanvas.clearRect(0, 0, canvasWidth, scopeHeight);
    freqCanvas.beginPath();
    freqCanvas.lineWidth = 1;
    freqCanvas.strokeStyle = "red";

    freqCanvas.moveTo(0, scopeHeight);
    freqCanvas.lineTo(canvasWidth, scopeHeight);
    freqCanvas.stroke();
    freqCanvas.moveTo(0, scopeHeight - scale * cutoff);
    freqCanvas.lineTo(canvasWidth, scopeHeight - scale * cutoff);
    freqCanvas.stroke();

    freqCanvas.lineWidth = 1;
    freqCanvas.strokeStyle = "black";
    freqCanvas.moveTo(0, 0);
    freqCanvas.beginPath();
    for (let i = 0; i < amd.length / multiple; i++) {
      freqCanvas.lineTo(i, scopeHeight - scale * amd[i * multiple]);
    }
    freqCanvas.stroke();

    if (Math.round(amd[minpos] * ratio) < maxval) {
      return sampleRate / minpos;
    } else {
      return null;
    }
  };
}
