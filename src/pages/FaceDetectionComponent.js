import React, { useState, useEffect, useRef } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  Alert,
  Spinner,
  Badge,
  Form,
  Modal,
} from "react-bootstrap";
import * as faceapi from "face-api.js";
import { dbHelper } from "../helpers/dbHelper";

const FaceDetectionComponent = () => {
  const videoRef = useRef();
  const canvasRef = useRef();
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedPersons, setDetectedPersons] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [knownFaces, setKnownFaces] = useState([]);
  const [error, setError] = useState(null);
  const [showAddPersonModal, setShowAddPersonModal] = useState(false);
  const [newPersonInfo, setNewPersonInfo] = useState({
    name: "",
    role: "",
    accessLevel: "standard",
    faceDescriptor: null,
    thumbnail: null,
  });
  const [detectionSettings, setDetectionSettings] = useState({
    detectionRange: 5, // meters
    minConfidence: 0.3,
    scanFrequency: "high", // high, medium, low
  });
  const [showSettings, setShowSettings] = useState(false);
  const [dbInitialized, setDbInitialized] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(true);
  
  const isDetectingRef = useRef(false);
  const faceMatchThreshold = 0.6; // Lower values are more strict (0.6 is more strict than 0.7)
  const detectionRef = useRef(null);
  const lastDetectionTime = useRef({});

  // Initialize the database when component mounts
  useEffect(() => {
    const initializeDB = async () => {
      try {
        await dbHelper.initDB();
        setDbInitialized(true);
        console.log("Database initialized successfully");
      } catch (err) {
        console.error("Failed to initialize database:", err);
        setError("Failed to initialize database: " + err);
      }
    };

    initializeDB();

    return () => {
      // Close DB connection on unmount if needed
    };
  }, []);

  // Load face-api models on component mount
  useEffect(() => {
    let isMounted = true;

    const loadModels = async () => {
      try {
        const MODEL_URL = process.env.PUBLIC_URL + "/models";
        console.log("Loading models from:", MODEL_URL);
        setModelsLoading(true);

        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        ]);

        if (isMounted) {
          console.log("All models loaded successfully");
          setIsModelLoaded(true);
          setModelsLoading(false);
          loadSavedData();
        }
      } catch (err) {
        if (isMounted) {
          setError("Failed to load face recognition models: " + err.message);
          console.error("Error loading models:", err);
          setModelsLoading(false);
        }
      }
    };

    loadModels();

    return () => {
      isMounted = false;
      stopDetection();
    };
  }, []);

  // Load saved data from IndexedDB when database is initialized
  useEffect(() => {
    if (dbInitialized) {
      loadSavedData();
    }
  }, [dbInitialized]);

  // Load saved data from IndexedDB
  const loadSavedData = async () => {
    if (!dbInitialized) return;
    
    try {
      // Load detection settings
      const settings = await dbHelper.getAllData("settings");
      if (settings && settings.length > 0) {
        setDetectionSettings(settings[0].data);
      }

      // Load known faces
      const faces = await dbHelper.getAllData("knownFaces");
      if (faces && faces.length > 0) {
        // Convert stored face descriptors back to Float32Array
        const processedFaces = faces.map(face => ({
          ...face,
          faceDescriptor: new Float32Array(Object.values(face.faceDescriptor)),
        }));
        setKnownFaces(processedFaces);
      }

      // Load recent detections (limit to 20 for performance)
      const detections = await dbHelper.getAllData("detections");
      if (detections && detections.length > 0) {
        // Sort by timestamp in descending order and take the first 20
        const sortedDetections = detections
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 20);
        setDetectedPersons(sortedDetections);
      }

      // Load notifications (limit to 20 for performance)
      const notifs = await dbHelper.getAllData("notifications");
      if (notifs && notifs.length > 0) {
        // Sort by timestamp in descending order and take the first 20
        const sortedNotifs = notifs
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 20);
        setNotifications(sortedNotifs);
      }

      console.log("All data loaded from IndexedDB");
    } catch (err) {
      console.error("Error loading saved data:", err);
      setError("Failed to load saved data: " + err);
    }
  };

  // Stop detection and clean up resources
  const stopDetection = () => {
    setIsDetecting(false);
    isDetectingRef.current = false;

    if (detectionRef.current) {
      cancelAnimationFrame(detectionRef.current);
      detectionRef.current = null;
    }

    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const stopFaceDetection = () => {
    console.log("Stopping face detection");
    stopDetection();
    
    // Save settings if changed
    saveSettings();
  };

  // Start video stream with optimal settings for distance detection
  const startVideo = async () => {
    stopDetection();

    try {
      // Request higher resolution for better distance detection
      const constraints = {
        video: {
          facingMode: "user",
          width: { ideal: 1280 }, // Higher resolution
          height: { ideal: 720 },
          frameRate: { ideal: 30 }, // Higher frame rate
        },
      };

      console.log("Requesting media with constraints:", constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch((err) => {
            console.error("Error playing video:", err);
            setError("Error playing video: " + err.message);
          });
        };

        videoRef.current.onplaying = () => {
          if (canvasRef.current) {
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            startFaceDetection();
          }
        };
      }
    } catch (err) {
      setError("Failed to access camera: " + err.message);
      console.error("Error accessing camera:", err);
    }
  };

  // Start face detection process
  const startFaceDetection = () => {
    console.log("Starting face detection with settings:", detectionSettings);
    setIsDetecting(true);
    isDetectingRef.current = true;
    detectFaces();
  };

  // Face detection loop optimized for 4-5 meter distance detection
  const detectFaces = async () => {
    if (!isDetectingRef.current || !videoRef.current || !canvasRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Skip this frame if video isn't ready
    if (video.readyState !== 4) {
      detectionRef.current = requestAnimationFrame(detectFaces);
      return;
    }

    try {
      const displaySize = {
        width: video.videoWidth,
        height: video.videoHeight,
      };
      faceapi.matchDimensions(canvas, displaySize);

      // Initial faster detection to find potential faces
      const initialDetections = await faceapi.detectAllFaces(
        video,
        new faceapi.TinyFaceDetectorOptions({
          scoreThreshold: detectionSettings.minConfidence - 0.2, // Lower threshold for initial scan
          inputSize: 416, // Larger input size helps detect distant faces
        })
      );

      // If faces found, do more detailed analysis
      let completeDetections = [];
      if (initialDetections.length > 0) {
        // For distance surveillance, use SSD MobileNet with lower confidence threshold
        completeDetections = await faceapi
          .detectAllFaces(
            video,
            new faceapi.SsdMobilenetv1Options({
              minConfidence: detectionSettings.minConfidence,
              maxResults: 20, // More results for surveillance
            })
          )
          .withFaceLandmarks()
          .withFaceExpressions()
          .withFaceDescriptors();
      }

      // Resize detections to match display size
      const resizedDetections = faceapi.resizeResults(
        completeDetections,
        displaySize
      );

      // Clear canvas before drawing
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, canvas.width, canvas.height);

      // Draw detections and process results
      if (resizedDetections.length > 0) {
        // Draw basic detections
        faceapi.draw.drawDetections(canvas, resizedDetections);
        faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);

        // Face recognition for known faces
        if (knownFaces.length > 0) {
          const labeledDescriptors = knownFaces.map(
            (person) =>
              new faceapi.LabeledFaceDescriptors(person.name, [
                person.faceDescriptor,
              ])
          );

          const faceMatcher = new faceapi.FaceMatcher(
            labeledDescriptors,
            faceMatchThreshold
          );

          const results = resizedDetections.map((detection) =>
            faceMatcher.findBestMatch(detection.descriptor)
          );

          // Draw boxes with names
          results.forEach((result, i) => {
            const box = resizedDetections[i].detection.box;
            // Estimate distance based on face size
            const faceSize = Math.max(box.width, box.height);
            const estimatedDistance = estimateDistance(
              faceSize,
              video.videoWidth
            );

            // Only process faces within the configured range
            if (estimatedDistance <= detectionSettings.detectionRange) {
              const boxText = `${result.label} (${estimatedDistance.toFixed(
                1
              )}m)`;
              const drawBox = new faceapi.draw.DrawBox(box, {
                label: boxText,
                boxColor: result.label !== "unknown" ? "green" : "red",
                lineWidth: 2,
              });
              drawBox.draw(canvas);

              // Process detection with throttling based on scan frequency
              const now = Date.now();
              const personId =
                result.label + (result.label === "unknown" ? i : "");
              const lastTime = lastDetectionTime.current[personId] || 0;
              const timeThreshold = getDetectionTimeThreshold();

              if (now - lastTime > timeThreshold) {
                lastDetectionTime.current[personId] = now;
                processFaceDetection(
                  resizedDetections[i],
                  result,
                  estimatedDistance
                );
              }
            }
          });
        } else {
          // Handle case with no known faces
          resizedDetections.forEach((detection) => {
            const box = detection.detection.box;
            const faceSize = Math.max(box.width, box.height);
            const estimatedDistance = estimateDistance(
              faceSize,
              video.videoWidth
            );

            if (estimatedDistance <= detectionSettings.detectionRange) {
              const drawBox = new faceapi.draw.DrawBox(box, {
                label: `Unknown (${estimatedDistance.toFixed(1)}m)`,
                boxColor: "red",
              });
              drawBox.draw(canvas);

              // Process unknown faces with throttling
              const now = Date.now();
              const personId = "unknown" + Math.random();
              const timeThreshold = getDetectionTimeThreshold();

              if (
                now - (lastDetectionTime.current["unknown"] || 0) >
                timeThreshold
              ) {
                lastDetectionTime.current["unknown"] = now;
                processFaceDetection(
                  detection,
                  { label: "unknown", distance: 1 },
                  estimatedDistance
                );
              }
            }
          });
        }
      }
    } catch (err) {
      console.error("Detection error:", err);
    }

    // Get scan interval based on settings
    const scanInterval = getScanInterval();

    // Continue detection loop with appropriate timing
    if (isDetectingRef.current) {
      setTimeout(() => {
        detectionRef.current = requestAnimationFrame(detectFaces);
      }, scanInterval);
    }
  };

  // Get scan interval based on settings
  const getScanInterval = () => {
    switch (detectionSettings.scanFrequency) {
      case "low":
        return 300; // ~3 FPS
      case "medium":
        return 150; // ~7 FPS
      case "high":
        return 0; // Full speed
      default:
        return 0;
    }
  };

  // Get time threshold between detections of the same person
  const getDetectionTimeThreshold = () => {
    switch (detectionSettings.scanFrequency) {
      case "low":
        return 5000; // 5 seconds between recordings
      case "medium":
        return 2000; // 2 seconds between recordings
      case "high":
        return 1000; // 1 second between recordings
      default:
        return 2000;
    }
  };

  // Estimate distance based on face size in pixels
  const estimateDistance = (facePixelSize, frameWidth) => {
    // Constants based on average face width (15cm) and camera FOV
    // These values need calibration for your specific camera setup
    const FACE_WIDTH_CM = 15;
    const REF_DISTANCE_M = 1; // Reference distance in meters
    const REF_SIZE_RATIO = 0.15; // Face typically ~15% of frame width at 1m

    const expectedSizeAtRefDistance = frameWidth * REF_SIZE_RATIO;
    const sizeRatio = expectedSizeAtRefDistance / facePixelSize;

    // Apply distance formula (based on inverse relationship)
    return Math.max(0.5, REF_DISTANCE_M * sizeRatio);
  };

  // Process a single detected face
  const processFaceDetection = async (
    detection,
    recognitionResult,
    estimatedDistance
  ) => {
    const timestamp = new Date().toISOString();
    const confidence = detection.detection.score.toFixed(2);
    const expressions = detection.expressions;
    const dominantExpression = Object.keys(expressions).reduce((a, b) =>
      expressions[a] > expressions[b] ? a : b
    );

    const isKnown = recognitionResult.label !== "unknown";
    const personDetails = isKnown
      ? knownFaces.find((person) => person.name === recognitionResult.label)
      : null;

    const detectionId = `face-${timestamp}-${Math.random()
      .toString(36)
      .substring(2, 10)}`;

    // Capture face thumbnail
    const { faceThumbnail, contextImage } =
      captureDetectionThumbnail(detection);

    // Create detection record
    const newDetection = {
      id: detectionId,
      timestamp,
      confidence,
      dominantExpression,
      expressionConfidence: expressions[dominantExpression].toFixed(2),
      thumbnail: faceThumbnail,
      contextImage: contextImage,
      personName: recognitionResult.label,
      isKnown,
      estimatedDistance: estimatedDistance.toFixed(1),
      personDetails: personDetails
        ? {
            name: personDetails.name,
            role: personDetails.role,
            accessLevel: personDetails.accessLevel,
          }
        : null,
      faceDescriptor: Array.from(detection.descriptor),
    };

    // Store in IndexedDB
    try {
      await dbHelper.storeData("detections", newDetection);
      
      // Update state with latest detections (keeping most recent first)
      setDetectedPersons((prevDetections) => {
        const updatedDetections = [newDetection, ...prevDetections];
        const limitedDetections = updatedDetections.slice(0, 20); // Limit displayed items
        return limitedDetections;
      });
      
      // Create notification
      await createNotification(newDetection);
      
    } catch (err) {
      console.error("Error storing detection:", err);
    }
  };

  // Optimize thumbnail capture to create smaller images
  const captureDetectionThumbnail = (detection) => {
    try {
      const video = videoRef.current;
      const box = detection.detection.box;

      // Create two canvases - one for face close-up, one for context
      const faceCanvas = document.createElement("canvas");
      const contextCanvas = document.createElement("canvas");

      // Add margin around the face
      const margin = Math.max(box.width, box.height) * 0.2;

      // Use smaller dimensions for thumbnails to save space
      const thumbnailScale = 0.5; // Reduce to 50% size
      
      // Set dimensions for face close-up
      faceCanvas.width = (box.width + margin * 2) * thumbnailScale;
      faceCanvas.height = (box.height + margin * 2) * thumbnailScale;

      // Set dimensions for context image (entire frame but scaled down)
      contextCanvas.width = video.videoWidth * 0.25; // Just 25% of original size
      contextCanvas.height = video.videoHeight * 0.25;

      // Draw close-up face with margin
      const faceCtx = faceCanvas.getContext("2d");
      faceCtx.drawImage(
        video,
        Math.max(0, box.x - margin),
        Math.max(0, box.y - margin),
        box.width + margin * 2,
        box.height + margin * 2,
        0,
        0,
        faceCanvas.width,
        faceCanvas.height
      );

      // Draw full context image
      const contextCtx = contextCanvas.getContext("2d");
      contextCtx.drawImage(
        video, 
        0, 
        0, 
        video.videoWidth, 
        video.videoHeight,
        0,
        0,
        contextCanvas.width,
        contextCanvas.height
      );

      // Draw a highlighting box on the context image
      contextCtx.strokeStyle = "#28a745";
      contextCtx.lineWidth = 3;
      contextCtx.strokeRect(
        box.x * 0.25, 
        box.y * 0.25, 
        box.width * 0.25, 
        box.height * 0.25
      );

      // Use lower image quality for storage
      return {
        faceThumbnail: faceCanvas.toDataURL("image/jpeg", 0.6),
        contextImage: contextCanvas.toDataURL("image/jpeg", 0.4),
      };
    } catch (err) {
      console.error("Error capturing thumbnail:", err);
      return { faceThumbnail: null, contextImage: null };
    }
  };

  // Create a notification for a detected face
  const createNotification = async (detection) => {
    const notificationType = detection.isKnown ? "info" : "warning";
    const title = detection.isKnown
      ? `${detection.personName} Detected`
      : "Unknown Person Detected";

    const message = detection.isKnown
      ? `Detected ${detection.personName} (${detection.personDetails.role}) at ~${detection.estimatedDistance}m with ${detection.confidence} confidence. Expression: ${detection.dominantExpression}`
      : `Unknown person detected at ~${detection.estimatedDistance}m with ${detection.confidence} confidence. Expression: ${detection.dominantExpression}`;

    const notification = {
      id: `notification-${detection.id}`,
      title: title,
      message: message,
      timestamp: detection.timestamp,
      thumbnail: detection.thumbnail,
      contextImage: detection.contextImage,
      isRead: false,
      type: notificationType,
      detectionId: detection.id,
      personName: detection.personName,
      isKnown: detection.isKnown,
      estimatedDistance: detection.estimatedDistance,
    };

    try {
      // Store in IndexedDB
      await dbHelper.storeData("notifications", notification);
      
      // Update state with latest notifications
      setNotifications((prevNotifications) => {
        const updatedNotifications = [notification, ...prevNotifications];
        const limitedNotifications = updatedNotifications.slice(0, 20); // Limit displayed items
        return limitedNotifications;
      });
    } catch (err) {
      console.error("Error storing notification:", err);
    }
  };

  // Mark a notification as read
  const markNotificationAsRead = async (notificationId) => {
    try {
      // Get the notification from IndexedDB
      const notification = await dbHelper.getDataById("notifications", notificationId);
      if (notification) {
        // Update the notification
        notification.isRead = true;
        await dbHelper.storeData("notifications", notification);
        
        // Update state
        setNotifications((prevNotifications) => {
          return prevNotifications.map((n) =>
            n.id === notificationId ? { ...n, isRead: true } : n
          );
        });
      }
    } catch (err) {
      console.error("Error marking notification as read:", err);
    }
  };

  // Clear all notifications
  const clearAllNotifications = async () => {
    try {
      await dbHelper.clearStore("notifications");
      setNotifications([]);
    } catch (err) {
      console.error("Error clearing notifications:", err);
    }
  };

  // Handle adding a new known person from detection
  const handleAddPerson = (detection) => {
    if (!detection) return;

    // Convert back to Float32Array if needed
    const faceDescriptor = Array.isArray(detection.faceDescriptor)
      ? new Float32Array(detection.faceDescriptor)
      : detection.faceDescriptor;

    setNewPersonInfo({
      name: "",
      role: "",
      accessLevel: "standard",
      faceDescriptor: faceDescriptor,
      thumbnail: detection.thumbnail,
    });

    setShowAddPersonModal(true);
  };

  // Save new person to known faces
  const saveNewPerson = async () => {
    if (!newPersonInfo.name || !newPersonInfo.faceDescriptor) return;

    const newPerson = {
      id: `person-${Date.now()}`,
      name: newPersonInfo.name,
      role: newPersonInfo.role,
      accessLevel: newPersonInfo.accessLevel,
      dateAdded: new Date().toISOString(),
      faceDescriptor: newPersonInfo.faceDescriptor,
      thumbnail: newPersonInfo.thumbnail,
    };

    try {
      // Convert Float32Array to regular array for storage
      const personForStorage = {
        ...newPerson,
        faceDescriptor: Array.from(newPerson.faceDescriptor)
      };
      
      // Store in IndexedDB
      await dbHelper.storeData("knownFaces", personForStorage);
      
      // Update state
      setKnownFaces((prevKnownFaces) => [...prevKnownFaces, newPerson]);
      setShowAddPersonModal(false);
    } catch (err) {
      console.error("Error saving new person:", err);
      setError("Failed to save person: " + err);
    }
  };

  // Reset face database
  const resetFaceDatabase = async () => {
    if (
      window.confirm(
        "Are you sure you want to delete all known faces? This cannot be undone."
      )
    ) {
      try {
        await dbHelper.clearStore("knownFaces");
        setKnownFaces([]);
      } catch (err) {
        console.error("Error resetting face database:", err);
        setError("Failed to reset face database: " + err);
      }
    }
  };

  // Save detection settings
  const saveSettings = async () => {
    try {
      await dbHelper.storeData("settings", {
        id: "detectionSettings",
        data: detectionSettings
      });
      setShowSettings(false);
    } catch (err) {
      console.error("Error saving settings:", err);
      setError("Failed to save settings: " + err);
    }
  }
  // Get unread notifications count
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <Container fluid>
      <Row className="mb-4">
        <Col>
          <h2>Surveillance Face Detection System</h2>
          <h5 className="text-muted">
            Range: Up to {detectionSettings.detectionRange} meters
          </h5>
          {error && <Alert variant="danger">{error}</Alert>}

          {modelsLoading ? (
            <div className="text-center my-5">
              <Spinner animation="border" role="status" />
              <p className="mt-2">Loading face recognition models...</p>
            </div>
          ) : (
            <Card className="mb-4">
              <Card.Body>
                <Row>
                  <Col md={8}>
                    <div
                      className="video-container position-relative"
                      style={{
                        maxWidth: "100%",
                        height: "auto",
                        minHeight: "400px",
                        backgroundColor: "#000",
                      }}
                    >
                      <video
                        ref={videoRef}
                        className="rounded w-100"
                        style={{ maxWidth: "100%", height: "auto" }}
                        muted
                        playsInline
                      />
                      <canvas
                        ref={canvasRef}
                        className="position-absolute top-0 left-0"
                        style={{ width: "100%", height: "100%" }}
                      />
                      {isDetecting && (
                        <div
                          className="detection-status position-absolute"
                          style={{
                            top: "10px",
                            left: "10px",
                            background: "rgba(0,0,0,0.5)",
                            color: "white",
                            padding: "5px",
                            borderRadius: "5px",
                          }}
                        >
                          <span
                            className="detection-dot"
                            style={{
                              display: "inline-block",
                              width: "10px",
                              height: "10px",
                              backgroundColor: "red",
                              borderRadius: "50%",
                              marginRight: "5px",
                              animation: "blink 1s infinite",
                            }}
                          ></span>
                          Active Surveillance
                        </div>
                      )}
                    </div>
                  </Col>
                  <Col md={4}>
                    <Card className="h-100">
                      <Card.Header>Controls</Card.Header>
                      <Card.Body>
                        {isDetecting ? (
                          <Button
                            variant="danger"
                            className="w-100 mb-3"
                            onClick={stopFaceDetection}
                          >
                            Stop Surveillance
                          </Button>
                        ) : (
                          <Button
                            variant="primary"
                            className="w-100 mb-3"
                            onClick={startVideo}
                          >
                            Start Surveillance
                          </Button>
                        )}

                        <Button
                          variant="secondary"
                          className="w-100 mb-3"
                          onClick={() => setShowSettings(true)}
                        >
                          Detection Settings
                        </Button>

                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <h5>Known Faces: {knownFaces.length}</h5>
                        </div>

                        <Button
                          variant="outline-danger"
                          size="sm"
                          className="w-100 mb-3"
                          onClick={resetFaceDatabase}
                        >
                          Reset Face Database
                        </Button>

                        <div className="d-flex justify-content-between align-items-center">
                          <h5>Alerts</h5>
                          {unreadCount > 0 && (
                            <Badge bg="danger" pill>
                              {unreadCount}
                            </Badge>
                          )}
                        </div>

                        <Button
                          variant="secondary"
                          className="w-100 mt-2"
                          onClick={clearAllNotifications}
                        >
                          Clear All Alerts
                        </Button>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          )}
        </Col>
      </Row>

      <Row>
        <Col md={6}>
          <Card>
            <Card.Header>
              <h5 className="mb-0">Recent Detections</h5>
            </Card.Header>
            <Card.Body style={{ maxHeight: "400px", overflowY: "auto" }}>
              {detectedPersons.length === 0 ? (
                <p className="text-center text-muted">No detections yet</p>
              ) : (
                <Row>
                  {detectedPersons.slice(0, 12).map((person) => (
                    <Col key={person.id} md={4} className="mb-3">
                      <Card
                        className={
                          person.isKnown ? "border-primary" : "border-warning"
                        }
                      >
                        {person.thumbnail && (
                          <Card.Img
                            variant="top"
                            src={person.thumbnail}
                            alt={`Face of ${person.personName}`}
                          />
                        )}
                        <Card.Body className="p-2">
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <strong>{person.personName}</strong>
                            <Badge
                              bg={person.isKnown ? "primary" : "warning"}
                              pill
                            >
                              {person.isKnown ? "Known" : "Unknown"}
                            </Badge>
                          </div>
                          <small>
                            {person.isKnown &&
                              person.personDetails &&
                              person.personDetails.role && (
                                <>
                                  Role: {person.personDetails.role}
                                  <br />
                                </>
                              )}
                            Distance: ~{person.estimatedDistance}m
                            <br />
                            Confidence: {person.confidence}
                            <br />
                            Mood: {person.dominantExpression}
                            <br />
                            {new Date(person.timestamp).toLocaleTimeString()}
                          </small>

                          {!person.isKnown && (
                            <Button
                              variant="primary"
                              size="sm"
                              className="w-100 mt-2"
                              onClick={() => handleAddPerson(person)}
                            >
                              Add to Database
                            </Button>
                          )}
                        </Card.Body>
                      </Card>
                    </Col>
                  ))}
                </Row>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col md={6}>
          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Surveillance Alerts</h5>
              <Badge bg="danger" pill>
                {unreadCount}
              </Badge>
            </Card.Header>
            <Card.Body style={{ maxHeight: "400px", overflowY: "auto" }}>
              {notifications.length === 0 ? (
                <p className="text-center text-muted">No alerts yet</p>
              ) : (
                <div>
                  {notifications.map((notification) => (
                    <Alert
                      key={notification.id}
                      variant={
                        notification.isRead ? "secondary" : notification.type
                      }
                      className="d-flex align-items-center"
                    >
                      {notification.thumbnail && (
                        <img
                          src={notification.thumbnail}
                          alt="Alert"
                          style={{
                            width: "50px",
                            height: "50px",
                            marginRight: "10px",
                            objectFit: "cover",
                          }}
                          className="rounded"
                        />
                      )}
                      <div className="flex-grow-1">
                        <div className="d-flex justify-content-between">
                          <strong>{notification.title}</strong>
                          <small>
                            {new Date(
                              notification.timestamp
                            ).toLocaleTimeString()}
                          </small>
                        </div>
                        <p className="mb-0">{notification.message}</p>
                      </div>
                      {!notification.isRead && (
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          className="ms-2"
                          onClick={() =>
                            markNotificationAsRead(notification.id)
                          }
                        >
                          Mark as read
                        </Button>
                      )}
                    </Alert>
                  ))}
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Known Faces Database Section */}
      <Row className="mt-4">
        <Col>
          <Card>
            <Card.Header>
              <h5 className="mb-0">Known Faces Database</h5>
            </Card.Header>
            <Card.Body style={{ maxHeight: "400px", overflowY: "auto" }}>
              {knownFaces.length === 0 ? (
                <p className="text-center text-muted">
                  No known faces in database
                </p>
              ) : (
                <Row>
                  {knownFaces.map((person) => (
                    <Col key={person.id} md={3} className="mb-3">
                      <Card>
                        {person.thumbnail && (
                          <Card.Img
                            variant="top"
                            src={person.thumbnail}
                            alt={`Face of ${person.name}`}
                          />
                        )}
                        <Card.Body className="p-2">
                          <Card.Title className="fs-6">
                            {person.name}
                          </Card.Title>
                          <small>
                            Role: {person.role}
                            <br />
                            Access: {person.accessLevel}
                            <br />
                            Added:{" "}
                            {new Date(person.dateAdded).toLocaleDateString()}
                          </small>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            className="w-100 mt-2"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Remove ${person.name} from database?`
                                )
                              ) {
                                setKnownFaces((prevFaces) => {
                                  const updatedFaces = prevFaces.filter(
                                    (f) => f.id !== person.id
                                  );
                                  localStorage.setItem(
                                    "surveillanceKnownFaces",
                                    JSON.stringify(
                                      updatedFaces.map((p) => ({
                                        ...p,
                                        faceDescriptor: Array.from(
                                          p.faceDescriptor
                                        ),
                                      }))
                                    )
                                  );
                                  return updatedFaces;
                                });
                              }
                            }}
                          >
                            Remove
                          </Button>
                        </Card.Body>
                      </Card>
                    </Col>
                  ))}
                </Row>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Add Person Modal */}
      <Modal
        show={showAddPersonModal}
        onHide={() => setShowAddPersonModal(false)}
      >
        <Modal.Header closeButton>
          <Modal.Title>Add Person to Database</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {newPersonInfo.thumbnail && (
            <div className="text-center mb-3">
              <img
                src={newPersonInfo.thumbnail}
                alt="Face thumbnail"
                style={{ maxWidth: "200px", maxHeight: "200px" }}
                className="rounded"
              />
            </div>
          )}
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Name</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter person's name"
                value={newPersonInfo.name}
                onChange={(e) =>
                  setNewPersonInfo({ ...newPersonInfo, name: e.target.value })
                }
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Role</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter person's role"
                value={newPersonInfo.role}
                onChange={(e) =>
                  setNewPersonInfo({ ...newPersonInfo, role: e.target.value })
                }
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Access Level</Form.Label>
              <Form.Select
                value={newPersonInfo.accessLevel}
                onChange={(e) =>
                  setNewPersonInfo({
                    ...newPersonInfo,
                    accessLevel: e.target.value,
                  })
                }
              >
                <option value="standard">Standard</option>
                <option value="restricted">Restricted</option>
                <option value="admin">Administrator</option>
                <option value="security">Security</option>
              </Form.Select>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowAddPersonModal(false)}
          >
            Cancel
          </Button>
          <Button variant="primary" onClick={saveNewPerson}>
            Add to Database
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Settings Modal */}
      <Modal show={showSettings} onHide={() => setShowSettings(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Detection Settings</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Detection Range (meters)</Form.Label>
              <Form.Control
                type="range"
                min="1"
                max="10"
                step="0.5"
                value={detectionSettings.detectionRange}
                onChange={(e) =>
                  setDetectionSettings({
                    ...detectionSettings,
                    detectionRange: parseFloat(e.target.value),
                  })
                }
              />
              <div className="d-flex justify-content-between">
                <small>1m</small>
                <small>{detectionSettings.detectionRange}m</small>
                <small>10m</small>
              </div>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>
                Minimum Confidence Threshold: {detectionSettings.minConfidence}
              </Form.Label>
              <Form.Control
                type="range"
                min="0.1"
                max="0.9"
                step="0.05"
                value={detectionSettings.minConfidence}
                onChange={(e) =>
                  setDetectionSettings({
                    ...detectionSettings,
                    minConfidence: parseFloat(e.target.value),
                  })
                }
              />
              <div className="d-flex justify-content-between">
                <small>Low (0.1)</small>
                <small>Medium (0.5)</small>
                <small>High (0.9)</small>
              </div>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Scan Frequency</Form.Label>
              <Form.Select
                value={detectionSettings.scanFrequency}
                onChange={(e) =>
                  setDetectionSettings({
                    ...detectionSettings,
                    scanFrequency: e.target.value,
                  })
                }
              >
                <option value="low">Low (battery saving)</option>
                <option value="medium">Medium (balanced)</option>
                <option value="high">High (performance)</option>
              </Form.Select>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowSettings(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={saveSettings}>
            Save Settings
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Export Report Modal - Placeholder for future functionality */}
      <Modal show={false}>
        <Modal.Header closeButton>
          <Modal.Title>Export Surveillance Report</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Report Format</Form.Label>
              <Form.Select>
                <option value="pdf">PDF Document</option>
                <option value="csv">CSV (Excel compatible)</option>
                <option value="json">JSON Data</option>
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Date Range</Form.Label>
              <Row>
                <Col>
                  <Form.Control type="date" placeholder="Start Date" />
                </Col>
                <Col>
                  <Form.Control type="date" placeholder="End Date" />
                </Col>
              </Row>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                label="Include face thumbnails"
                defaultChecked
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                label="Include full context images"
                defaultChecked
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary">Cancel</Button>
          <Button variant="primary">Generate Report</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default FaceDetectionComponent;
