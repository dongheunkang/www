let codec_string = "avc1.42001F";

function reportError(e) {
  // Report error to the main thread
  console.log(e.message)
  postMessage(e.message);
}

function captureAndEncode(frame_source, cnv, fps, processChunk) {
  let frame_counter = 0;

  const init = {
    output: processChunk,
    error: reportError
  };

  const config = {
    codec: codec_string,
    width: cnv.width,
    height: cnv.height,
    //bitrate: 1000000,
    //avc : { format: "annexb" },
    framerate: fps,
    hardwareAcceleration : "prefer-hardware",
  };

  let encoder = new VideoEncoder(init);
  encoder.configure(config);  

  let reader = frame_source.getReader();  
  async function readFrame () {          
      const result = await reader.read();
      let frame = result.value;

      if (encoder.encodeQueueSize < 2) {
        frame_counter++;
        const insert_keyframe = false; // (frame_counter % 130) == 0;
        encoder.encode(frame, { keyFrame: insert_keyframe });                
        frame.close();
      } else {
        // Too many frames in flight, encoder is overwhelmed
        // let's drop this frame.        
        console.log("dropping a frame");
        frame.close();
      }

      setTimeout(readFrame, 1);
  };

  readFrame();
}

function startDecodingAndRendering(cnv) {
  let ctx = cnv.getContext("2d");
  let ready_frames = [];
  let underflow = true;
  let rotationAngle = 0;
  let grayscaleLevel = 100;

  async function renderFrame() {
    if (ready_frames.length == 0) {
      underflow = true;
      return;
    }
    let frame = ready_frames.shift();
    underflow = false;
/*
    ctx.save();
    ctx.clearRect(0, 0, cnv.width, cnv.height);
    ctx.translate(cnv.width / 2, cnv.height / 2);
    ctx.rotate(rotationAngle * Math.PI / 180);
    ctx.drawImage(frame, -cnv.width / 2, -cnv.height / 2);
    ctx.restore();
*/
    ctx.save();
    ctx.clearRect(0, 0, cnv.width, cnv.height);
    ctx.translate(cnv.width / 2, cnv.height / 2);
    ctx.scale(-1, 1); // 좌우 반전
    //ctx.rotate(rotationAngle * Math.PI / 180);
    ctx.filter = `grayscale(${grayscaleLevel}%) blur(5px)`;
    ctx.drawImage(frame, -cnv.width / 2, -cnv.height / 2);
    ctx.restore();

    rotationAngle -= 1; // 매 프레임마다 2도씩 회전
    frame.close();      
   
    if (rotationAngle == 360)
      rotationAngle = 0;
 
    setTimeout(renderFrame, 0);        
  }

/*
  async function renderFrame() {
    if (ready_frames.length == 0) {
      underflow = true;
      return;
    }
    let frame = ready_frames.shift();
    underflow = false;

    ctx.save();
    ctx.clearRect(0, 0, cnv.width, cnv.height);
    ctx.filter = `grayscale(${grayscaleLevel}%)`;
    ctx.drawImage(frame, 0, 0);
    ctx.restore();
    
    frame.close();      
    
    setTimeout(renderFrame, 0);        
  }
*/
  function handleFrame(frame) {
    ready_frames.push(frame);
    if (underflow) {
      underflow = false;
      setTimeout(renderFrame, 0);      
    }
  }

  const init = {
    output: handleFrame,
    error: reportError
  };

  let decoder = new VideoDecoder(init);
  return decoder;
}
 
var pre_config = null;
function main(frame_source, canvas, fps) {
  let decoder = startDecodingAndRendering(canvas);
  function processChunk(chunk, md) {
    let config = md.decoderConfig;
    if (config) {
      if (pre_config == null) {
        config.hardwareAcceleration = 'prefer-hardware';
        console.log("decoder reconfig", JSON.stringify(config, undefined, 2));
        decoder.configure(config);
        pre_config = config;
      }
    }

    decoder.decode(chunk);
  }
  captureAndEncode(frame_source, canvas, fps, processChunk);
}

self.onmessage = async function(e) {
  let frame_source = e.data.frame_source;
  let canvas = e.data.canvas;
  let fps = e.data.fps;
  
  main(frame_source, canvas, fps);
}
