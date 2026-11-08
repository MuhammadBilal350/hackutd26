# Vision interface

Use the agreed local browser approach: upload a dashboard photo or use a live
camera. Results show statistics only, without the submitted or annotated image.
Include score, grade, warnings, performance impact, estimated repair range and
actions. Mileage and model year remain manual inputs because CV does not read ODO.

Approaches: keeping OpenCV windows is smallest but constrains layout; a local
browser provides responsive styling and browser camera access. Use the latter.
Do not integrate the mobile app or replace/train the detector in this change.

Implementation choices: Python standard-library loopback server, vanilla HTML/CSS/JS,
dark teal visual theme, explicit camera start/stop, Capture and optional continuous
analysis. Camera preview is for aiming; the report contains no image. Analyze one
frame at a time; release camera tracks on stop and page exit. No external services.
Explain the model's limits in the UI; do not present its score as a diagnosis.
