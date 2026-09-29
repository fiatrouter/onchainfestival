Yes. Below is a **coder-ready graphical specification** based specifically on the floating strips in your reference.

## 1. Overall composition

Think of the scene as a **3D particle field of flexible branded ribbons**, not a collection of flat rectangles.

```text
                         BACKGROUND / FAR PLANE
       ─────────────────────────────────────────────────────

             [strip] ↗                 [strip] ↘
                    ╲                       ╱
        ✦ gold confetti        [strip]       ✦

    [ LARGE STRIP ]  ↘                     ↙ [strip]
          ╲
           ╲
            ╲
             ═══════════════════
             BLACK/GOLD RIBBON
             ═══════════════════
                         ╲
                          ╲

       ✦             [MAIN STRIP]              ✦
                         ╱
                        ╱

      [strip] ↗                         ↘ [strip]

       ─────────────────────────────────────────────────────
                         CAMERA
                    foreground / DOF
```

The key is **depth variation**: some strips should be very close to camera and partially blurred, some should sit in the middle plane and be sharp, while others should be small and distant.

---

# 2. Individual strip geometry

Each branded strip should be a **long flexible ribbon with rounded/curling ends**.

### Base dimensions

Use approximately:

```text
Length:      4.0 – 6.0 units
Width:       0.65 – 0.90 units
Thickness:   0.06 – 0.12 units
```

Recommended starting ratio:

```text
6 : 1 : 0.10
```

So if:

```text
length = 6.0
width  = 0.8
thick  = 0.08
```

you get the correct long, narrow appearance.

### Shape

Do **not** make it a perfectly flat rectangle.

The ribbon should have:

- slightly rounded corners
- gently curved longitudinal edges
- one or both ends curling backward
- subtle wave/bend along its length
- small amount of twisting around its longitudinal axis

Conceptually:

```text
SIDE VIEW

      __________________________
    /                            \
   /                              \__
  /                                  \_
 /                                      \

```

Or, more dramatically:

```text
       __________________
     /                    \
    /                      \____
   /                            \
  /                              \__
```

The ends should behave like a **thin metallic ribbon that has been curled by air**.

---

# 3. Front-facing surface

The main face is:

```text
┌───────────────────────────────────────┐
│                                       │
│   HARp       GUINNESS                  │
│                                       │
└───────────────────────────────────────┘
```

But because it is 3D, the logo follows the ribbon's surface.

### Surface layers

From outside → inside:

```text
GOLD EDGE
   ↓
┌─────────────────────────────┐
│ thin gold border            │
│                             │
│ BLACK / VERY DARK SURFACE   │
│                             │
│   GOLD HARP + GUINNESS      │
│                             │
└─────────────────────────────┘
   ↑
GOLD EDGE
```

Recommended:

- Base: almost-black `#080706`
- Gold edge: metallic gold
- Logo: warm ivory/cream
- Very subtle surface scratches
- Very subtle roughness variation

Don't make the black surface completely matte. It should have **slight glossy reflections**.

---

# 4. Gold border

This is important.

The strip has a **thin metallic gold perimeter**, rather than simply having a yellow rectangle around it.

Recommended border thickness:

```text
3–5% of ribbon width
```

For a `0.8` wide ribbon:

```text
gold border ≈ 0.025–0.04 units
```

Use:

```text
metallic = high
roughness = low-to-medium
```

The gold should catch the light strongly when the ribbon rotates.

---

# 5. Logo placement

The logo should sit approximately in the middle 70–80% of the strip.

```text
        ←──────── 100% ────────→

     ╭────────────────────────────╮
     │                            │
     │  [HARP]   GUINNESS         │
     │                            │
     ╰────────────────────────────╯
       ↑                        ↑
     curl                     curl
```

Don't make the logo touch the curled ends.

Use approximately:

```text
Logo height: 35–45% of strip height
Logo width:  60–75% of strip length
```

The harp should be positioned toward the left and **GUINNESS** immediately beside it.

The official Guinness site describes the harp as one of the brand's longstanding identifying symbols. ([Guinness][1]) 

### SVG

I couldn't find a clearly downloadable **official Guinness harp SVG asset** on the Guinness website itself.

For a readily available vector reference, this third-party page provides a Guinness vector in SVG format:

[Guinness SVG vector — Logo-Teka](https://logo-teka.com/en/guinness/?utm_source=chatgpt.com)

It specifically describes the current logo as the **golden harp + white typographic Guinness lettering**. ([LogoTeka][2])

There is also a Wikimedia Commons Guinness logo asset:

[Guinness logo — Wikimedia Commons](https://commons.wikimedia.org/wiki/File%3AGuinness-Logo-1.png?utm_source=chatgpt.com)

**Important:** the Guinness name/harp are trademarks. For a commercial Guinness-branded production, use an officially supplied/authorized brand asset and follow the brand's usage requirements rather than assuming an SVG download grants trademark permission. Guinness's official site confirms the brand's use of the harp as its identifying symbol. ([Guinness][1])

---

# 6. Strip rotation angles

This is what will make your coder's result resemble the reference rather than looking like repeated cards.

Use **different rotations for every strip**.

### Recommended rotation ranges

```text
X rotation: -25° to +25°
Y rotation: -40° to +40°
Z rotation: -70° to +70°
```

But don't randomize everything completely.

Create deliberate compositions.

### Example set

| Strip | Position     |    X |    Y |    Z | Scale |
| ----- | ------------ | ---: | ---: | ---: | ----: |
| 01    | upper-left   | +12° | -18° | -18° |  1.15 |
| 02    | upper-right  |  -8° | +25° | +20° |  0.85 |
| 03    | center-right |  +5° | -12° | -12° |  1.30 |
| 04    | lower-left   | -15° | +18° | +28° |  1.05 |
| 05    | lower-right  | +18° | -25° | -30° |  0.80 |
| 06    | far-left     | +20° | +35° | +42° |  0.55 |
| 07    | far-right    | -15° | -30° | -45° |  0.60 |
| 08    | foreground   |  +8° | +15° | -55° |  1.40 |

The important thing is **asymmetry**.

---

# 7. Curling / bending

Each strip should have a different amount of curvature.

Use something approximately like:

```text
Strip A: 10° bend
Strip B: 20° bend
Strip C: 30° bend
Strip D: 15° bend
Strip E: 40° bend
```

For the strongest foreground ribbons, allow one end to curl almost into a partial loop:

```text
             _________
          __/
        /
       /
      /
     /
    ╰
```

The curl should **not** be a perfect circle.

It should look physically irregular.

---

# 8. Perspective and depth

This is one of the most important parts.

Create three depth layers.

### FAR

```text
Distance: 15–25 units
Scale: 0.25–0.60
Blur: high
Brightness: slightly reduced
```

### MID

```text
Distance: 7–15 units
Scale: 0.60–1.10
Blur: low
Brightness: normal
```

### FOREGROUND

```text
Distance: 2–6 units
Scale: 1.10–1.70
Blur: moderate depending on position
```

The closest strips should sometimes be **partially outside the camera frame**.

Example:

```text
┌─────────────────────────────────────────┐
│                                         │
│  ███████████                            │
│             ╲                          │
│              ╲                         │
│                       [strip]          │
│                                         │
│        [strip]                          │
│                                         │
│                            ████████████ │
└─────────────────────────────────────────┘
```

This makes the scene feel much larger.

---

# 9. Camera

Use a cinematic perspective camera.

Suggested:

```text
Camera:
Perspective

Focal length:
35–50 mm

Starting value:
45 mm

Camera position:
(0, 0, 12)

Look-at:
(0, 0, 0)

FOV:
approximately 40–50°
```

For a more dramatic advertising look:

```text
Focal length = 50–65 mm
```

For a wider, more energetic rave look:

```text
Focal length = 28–35 mm
```

I'd start around **40–45 mm**.

---

# 10. Lighting

The strips need to look **gold-lit**, not simply colored gold.

Use several warm area lights.

### Main light

```text
Position: upper-left/front
Color: warm gold
Intensity: strong
Size: large
```

### Rim light

Put another light behind/right of the ribbons.

```text
Position: upper-right/back
Color: warm amber
Intensity: medium-high
```

This creates:

```text
             GOLD RIM
                ↓
       ╭────────────────╮
       │ BLACK RIBBON   │
       ╰────────────────╯
                       ↑
                   GOLD RIM
```

### Background

Almost completely black:

```text
RGB ≈ 2, 2, 2
```

with a **very subtle warm atmospheric glow**.

---

# 11. Confetti

The smaller pieces are not ribbons.

They're little metallic gold fragments:

```text
▰   ▪     ▰       ▪
     ▪          ▰
```

Use:

```text
Size: 0.08–0.30 units
Thickness: 0.02–0.05
```

Rotation:

```text
X: random
Y: random
Z: random
```

But keep them sparse.

The reference has roughly **70–80% visual emphasis on the branded ribbons and 20–30% on the small gold particles**.

---

# 12. Motion direction

If this is for animation, don't have every strip spinning randomly.

Give the whole scene a general movement:

```text
          ↗       ↗
      ↗       ↗
   ↗      CAMERA
```

Individual ribbons can rotate slowly:

```text
rotation speed:
5–20° / second
```

with occasional faster tumbling for foreground pieces.

A good animation would have:

```text
floating
+
slow rotation
+
subtle forward/backward movement
+
small random Z rotation
```

rather than chaotic spinning.

---

# 13. Material specification

### Ribbon

```text
Base color:       #070707
Metallic:         0.25–0.45
Roughness:        0.25–0.40
Specular:         high
```

### Gold border

```text
Base color:       metallic gold
Metallic:         0.85–1.0
Roughness:        0.15–0.25
```

### Logo

```text
Color: ivory / warm white
Metallic: 0
Roughness: 0.35–0.50
```

The gold should produce **bright specular highlights** when the ribbon rotates.

---

# 14. Most important visual rule

Tell the coder:

> **Do not create flat black rectangles with logos. Create physically curved, flexible 3D ribbons with rounded/curling ends, thin metallic-gold borders, embossed/printed branding following the ribbon surface, realistic thickness, reflections, perspective, depth of field and varied rotations.**

That single distinction is what separates the reference look from a basic 3D logo arrangement.

### Coder-ready short prompt

```text
Create a cinematic 3D particle scene containing 10–14 individual
flexible black branded ribbons floating in space.

Each ribbon is approximately 6:1 length-to-width ratio, thin
0.06–0.12 units thick, with rounded edges, subtle longitudinal
curvature, irregular twisting and curled ends.

Use a nearly black glossy surface with a thin metallic-gold
perimeter edge. Place the Guinness harp and GUINNESS wordmark
centrally on each ribbon, following the ribbon's curved surface.

Randomize each ribbon's position, scale, bend, curl and rotation.
Use X rotations from -25° to +25°, Y from -40° to +40° and Z
from -70° to +70°.

Create three depth layers: distant small ribbons, medium-distance
sharp ribbons and large foreground ribbons partially entering or
leaving the frame.

Use a 40–45mm perspective camera, black background, warm gold
area lights, strong gold rim lighting, realistic reflections,
ambient haze, subtle floating dust and shallow depth of field.

Add sparse small metallic-gold rectangular confetti pieces
between the ribbons.

The composition should feel like premium cinematic advertising:
luxurious, energetic, realistic, dimensional and physically
plausible. Avoid flat cards, avoid uniform spacing, avoid
symmetrical placement, and avoid identical ribbon shapes.
```

[1]: https://www.guinness.com/en/our-craft/guinness-story?utm_source=chatgpt.com "The Story of Guinness | Guinness® EN"
[2]: https://logo-teka.com/en/guinness/?utm_source=chatgpt.com "Guinness - Download transparent vector logo in SVG or PNG"
