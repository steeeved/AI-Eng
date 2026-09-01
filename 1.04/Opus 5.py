"""A stylized city skyline at night, reflected in still water. Pure turtle."""
import random
import turtle

random.seed(7)

W, H = 920, 640
WATER_Y = -150                                    # horizon / waterline
MOON_X, MOON_Y, MOON_R = 250, 190, 26
SKY = "#0e1428"
HAZE = ["#141c34", "#1a2440", "#212c4e"]
WATER, WATERLINE = "#0a0f20", "#2c3a63"
BACK_SHADES = ["#2b365a", "#25304e", "#303c64"]   # far towers: hazier, lighter
FRONT_SHADES = ["#141a30", "#0f1528", "#1a2138"]  # near towers: darker, crisper
WIN_WARM, WIN_DIM = "#ffd79a", "#b9873f"
MOON, HALO = "#f4ecd6", ["#161e38", "#1c2544", "#232e54"]
GLINT, BEACON = ["#6d7699", "#565f80", "#434b68"], "#ff5f4d"


def setup():
    screen = turtle.Screen()
    screen.setup(W, H)
    screen.bgcolor(SKY)
    screen.title("Opus 5")
    screen.tracer(0, 0)
    t = turtle.Turtle(visible=False)
    t.speed(0)
    t.penup()
    return screen, t


def rect(t, x, y, w, h, color):
    t.goto(x, y)
    t.setheading(0)
    t.fillcolor(color)
    t.begin_fill()
    for side in (w, h, w, h):
        t.forward(side)
        t.left(90)
    t.end_fill()


def draw_moon(t):
    for i, color in enumerate(HALO):
        t.goto(MOON_X, MOON_Y)
        t.dot(MOON_R * (6.5 - i * 1.8), color)
    t.dot(MOON_R * 2, MOON)
    t.goto(MOON_X - MOON_R * 0.55, MOON_Y + MOON_R * 0.1)
    t.dot(MOON_R * 1.75, HALO[2])                 # bite the crescent out of the disc


def draw_stars(t, count):
    for _ in range(count):
        x = random.uniform(-W / 2, W / 2)
        y = random.uniform(WATER_Y + 120, H / 2)
        if (x - MOON_X) ** 2 + (y - MOON_Y) ** 2 > 150 ** 2:   # keep the glow clean
            t.goto(x, y)
            t.dot(random.choice([1.5, 2, 2, 3]), "#dfe6f5")


def draw_windows(t, x, w, h, lit_chance, warm):
    """A grid of windows, mostly dark, with a scattering lit."""
    step_x, step_y = 13, 17
    cols, rows = int((w - 10) // step_x), int((h - 14) // step_y)
    pad = (w - cols * step_x) / 2
    for r in range(rows):
        for c in range(cols):
            if random.random() < lit_chance:
                color = WIN_WARM if random.random() < warm else WIN_DIM
                rect(t, x + pad + c * step_x, WATER_Y + 10 + r * step_y, 6, 9, color)


def make_skyline(x_end, shades, h_lo, h_hi, w_lo, w_hi):
    """Lay out one depth layer; returns (x, w, h, color) records."""
    towers, x = [], -W / 2 - 30
    while x < x_end:
        w, h = random.randint(w_lo, w_hi), random.randint(h_lo, h_hi)
        towers.append((x, w, h, random.choice(shades)))
        x += w + random.randint(-4, 10)           # negative gaps let towers overlap
    return towers


def draw_layer(t, towers, lit_chance, warm):
    for x, w, h, color in towers:
        rect(t, x, WATER_Y, w, h, color)
        draw_windows(t, x, w, h, lit_chance, warm)


def draw_beacons(t, towers, threshold):
    """Aviation lights on anything tall enough to be a hazard."""
    for x, w, h, _ in towers:
        if h >= threshold:
            t.goto(x + w / 2, WATER_Y + h + 4)
            t.dot(9, "#3a1f2a")
            t.dot(4, BEACON)


def draw_reflection(t, layers):
    """Mirrored towers, dimmed and dissolved by ripples that widen with distance."""
    rect(t, -W / 2, -H / 2, W, WATER_Y + H / 2, WATER)
    for towers, tint in layers:
        for x, w, h, _ in towers:
            rect(t, x, WATER_Y - h * 0.45, w, h * 0.45, tint)
    y, span = WATER_Y - 3, WATER_Y + H / 2
    while y > -H / 2:
        d = (WATER_Y - y) / span                  # 0 at the shore, 1 at the near edge
        gap = 2 + 11 * d
        rect(t, -W / 2, y, W, gap, WATER)
        if d < 0.8:                               # moonlight breaking on the surface
            gw = 16 + 70 * d
            rect(t, MOON_X - gw / 2, y + gap, gw, 2, GLINT[int(d * 3)])
        y -= gap + 12 * (1 - d)
    rect(t, -W / 2, WATER_Y - 1, W, 2, WATERLINE)


def main():
    screen, t = setup()
    draw_stars(t, 170)
    draw_moon(t)
    for i, color in enumerate(reversed(HAZE)):        # light pooling above the city
        rect(t, -W / 2, WATER_Y, W, 150 - i * 45, color)
    far = make_skyline(W / 2, BACK_SHADES, 60, 190, 45, 90)
    near = make_skyline(W / 2, FRONT_SHADES, 110, 330, 55, 105)
    draw_layer(t, far, 0.10, 0.4)
    draw_layer(t, near, 0.22, 0.75)
    draw_beacons(t, near, 270)
    draw_reflection(t, [(far, "#1b2440"), (near, "#12182c")])
    screen.update()
    turtle.done()


if __name__ == "__main__":
    main()
