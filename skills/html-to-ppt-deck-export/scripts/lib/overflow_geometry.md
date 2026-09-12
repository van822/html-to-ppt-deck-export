# Overflow measurement model (internal)

This implementation note describes the current renderer and its diagnostic
boundary. The helper modules are internal, not a public geometry library.

## Coordinate spaces and existing controls

Source DOM rectangles are used for selecting/cloning content, never as final
slide bounds: selectors, ancestor CSS, viewport layout and export styles can all
change the clone's geometry. Full/partial/chapter clones are placed inside
the fixed export stage. exportCss and per-slide className apply before fitting.

The builder sets the inner raw width from fit.width/defaultWidth. Unless
preserveWide is true, shortWidth/mediumWidth can narrow it after height checks.
The resulting pre-scale inner bounding rectangle is the existing rawWidth and
rawHeight metric; it does not include every absolutely positioned descendant.

Scale is the minimum of maxScale and the width/height ratios available after
padX/padY. The existing font guard may remeasure it. Horizontal centering and
topBias position the scaled inner box. Padding is a fitting control, not a hard
clipping boundary: occupying that margin is not itself overflow.

computeClip uses the transformed inner rectangle, cropX/cropY, minClipW and
optional crop centers, expands toward the stage aspect ratio, clamps to the stage
and rounds the crop to integer CSS pixels. noCrop selects the full stage. This
crop algorithm intentionally remains unchanged, even if descendants exceed the
inner box.

For this pinned Playwright page.screenshot call (fullPage omitted), clip is in
viewport CSS coordinates and is intersected with the viewport. DOM client
rectangles already contain transforms and use viewport coordinates. Measurements
subtract the stage's visual top-left from both DOM and screenshot rectangles.
No document scroll offset is added. The effective visible rectangle is the
intersection of stage, viewport and screenshot crop in this shared coordinate
space, including the stage's inner padding edge when its overflow clips content.
A normal stage has origin (0,0), but origin translation is not assumed.

PNG coordinates correspond approximately to (viewport point - screenshot clip
origin) * deviceScaleFactor. Screenshot rounding can affect the last raster row
or column. Diagnostics stay in transformed CSS pixels and are never multiplied
by deviceScaleFactor or compared directly with pre-scale scrollWidth/scrollHeight.

## Measured content and clipping

Immediately after the existing per-slide wait and before the screenshot, collect
read-only geometry for painted element boxes (backgrounds/borders), text-node
Range fragments and atomic media/control outer boxes. Transparent layout-only
wrappers, display:none and opacity:0 subtrees do not count as painted content.
Text uses line fragments; element rectangles use client boxes. Shadows and
outlines are decorative ink and excluded. Borders belong to the measured boxes.

Rectangular overflow:hidden/clip/auto/scroll ancestors use transformed client
padding bounds. Apply inner clips before outer ones. Respect positioned elements'
containing blocks so intervening overflow ancestors that do not clip them are
ignored. Report container clipping first, then compare surviving content against
the stage and finally the crop. This avoids claiming that already-hidden content
also leaks beyond the stage. Zero-sized clipping containers can hide all content.

Axis-aligned positive scale and translation are supported. Rotated/skewed/
reflected/3D bounds are conservative rectangles and any boundary violations have
uncertain confidence. Complex clipping boundaries are not used to assert exact
visible intersections. Ordinary rotation entirely inside all measured bounds is
not a violation. clip-path/masks/paint containment, generated pseudo-elements,
embedded documents/shadow content and active animations produce explicit coverage
limitations. SVG, canvas, images, video and controls use outer boxes only; their
internal drawing/cropping is outside this model.

The model measures geometric boxes, not exact painted pixels, semantic importance,
occlusion, border-radius corner masks, filters, object-fit cropping or user intent.
Decorative boxes and transparent media may still merit manual dismissal. DOM/CSS
can change between measurement and capture. No universal claim of complete
clipping detection is made.

## Tolerance, evidence and limits

The fixed tolerance is 1 transformed CSS pixel per edge. A difference <=1 is
ignored; larger amounts are reported using unrounded comparisons, then evidence
is rounded to three decimals. This covers subpixel/client-size/crop rounding
without tying results to screenshot device scale. No threshold changes layout.

Per-slide metrics gain only an additive overflow object. It contains the shared
coordinate-space label, tolerance, status, content/stage/crop/visible bounds,
diagnosticCount, truncatedDiagnostics, diagnostics and limitations. contentBounds
unites fragments surviving supported container clipping, before stage/crop cuts.
Null bounds represent unavailable/no measured content, not a numeric zero box.

Types are stage-overflow, crop-clipping and container-clipping; axes are
horizontal, vertical or both; confidence is measured or uncertain. Intent is
always unknown. Crop/container clipping may be an intentional composition and
does not become a plan-validation error. Inside means no detected violation
within coverage and tolerance, not visual acceptance.

Evidence groups by boundary/type/confidence, storing union bounds, maximum
per-edge overflow, affected fragment count, at most three stable descendant-path
examples and uncertainty reasons. No source text or full DOM dumps are retained.
The manifest holds at most 20 groups per slide with an explicit omitted count;
measurement is capped at 5000 elements and 20000 fragments with a limitation
when reached. The terminal prints one short line per affected/uncertain slide.
Normal slides are silent. Diagnostic failures are reported as uncertain and do
not block screenshots. Existing validation/runtime failures retain their exit
behavior; diagnostic findings alone still exit 0.
