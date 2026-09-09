import turtle
import random
import math

random.seed(42)
screen = turtle.Screen()
screen.setup(900, 600)
screen.bgcolor("#0a0a2e")
screen.tracer(0)
screen.title("Big pickle")
t = turtle.Turtle()
t.hideturtle()
t.speed(0)

PAL = {"bldgs": ["#1a1a2e","#16213e","#0f3460","#1b1b3a","#12122a"],
       "win_on": "#f0c040", "win_off": "#0d0d1a", "moon": "#f5e6a3",
       "crater": "#e8d89a", "water": "#0a1628", "water_ln": "#1a3050"}

def rect(x, y, w, h, color):
    t.penup(); t.goto(x, y); t.pendown()
    t.fillcolor(color); t.pencolor(color)
    t.begin_fill()
    for _ in range(2):
        t.forward(w); t.left(90); t.forward(h); t.left(90)
    t.end_fill()

def hex_blend(c1, c2, ratio):
    a, b = bytes.fromhex(c1[1:]), bytes.fromhex(c2[1:])
    r = tuple(int(x + (y - x) * ratio) for x, y in zip(a, b))
    return f"#{r[0]:02x}{r[1]:02x}{r[2]:02x}"

def gradient_sky():
    bands = 10
    bh = 400 / bands
    cols = ["#050520", "#0a0a2e", "#101040"]
    for i in range(bands):
        ratio = i / (bands - 1)
        if ratio < 0.5:
            rect(-450, 200 - i * bh, 900, bh + 1, hex_blend(cols[0], cols[1], ratio * 2))
        else:
            rect(-450, 200 - i * bh, 900, bh + 1, hex_blend(cols[1], cols[2], (ratio - 0.5) * 2))

def draw_moon(cx, cy, r):
    t.penup(); t.goto(cx, cy - r); t.pendown()
    t.fillcolor(PAL["moon"]); t.pencolor(PAL["moon"])
    t.begin_fill(); t.circle(r); t.end_fill()
    for dx, dy, cr in [(0.3,0.3,0.15),(-0.2,0.5,0.1),(0.1,-0.2,0.08)]:
        t.penup(); t.goto(cx+dx*r, cy-r+dy*r+cr); t.pendown()
        t.fillcolor(PAL["crater"]); t.begin_fill(); t.circle(cr*r); t.end_fill()
    for _ in range(8):
        a = random.uniform(0, 360)
        d = r + random.randint(5, 25)
        sx, sy = cx + d*math.cos(math.radians(a)), cy + d*math.sin(math.radians(a))
        t.penup(); t.goto(sx, sy); t.pendown()
        t.pencolor(PAL["moon"]); t.pensize(1); t.setheading(a+90)
        for l in [3, 2, 1]:
            t.forward(l); t.backward(l*2); t.forward(l); t.left(90)

def draw_stars(n=60):
    t.pensize(1)
    for _ in range(n):
        x, y = random.randint(-430,430), random.randint(130,280)
        s = random.choice([1,1,2,2,3])
        t.pencolor(random.choice(["#ffffff","#e8e8ff","#cce0ff"]))
        t.penup(); t.goto(x, y); t.pendown()
        for _ in range(4):
            t.forward(s); t.backward(s); t.left(90)

def draw_building(x, w, h, color):
    rect(x, -200, w, h, color)
    cols, rows = max(1,(w-8)//12), max(1,(h-10)//14)
    sx = x + (w - cols*12)//2 + 3
    sy = -200 + h - 16
    for r in range(rows):
        for c in range(cols):
            rect(sx+c*12, sy-r*14, 6, 8,
                 PAL["win_on"] if random.random() < 0.35 else PAL["win_off"])

def draw_water():
    rect(-450, -260, 900, 60, PAL["water"])
    t.pencolor(PAL["water_ln"]); t.pensize(1)
    for i in range(0, 56, 5):
        t.penup(); t.goto(-450, -204-i); t.pendown()
        t.forward(900 + random.randint(-15, 15))

def draw_reflections(bldgs):
    t.pensize(1)
    for bx, w, h, color in bldgs:
        t.pencolor(color)
        for i in range(0, min(h, 55), 5):
            fade = 1.0 - i / min(h, 55)
            t.penup(); t.goto(bx+random.randint(-2,2), -206-i)
            t.pendown(); t.setheading(0)
            t.forward(w * fade + random.randint(-3, 3))

gradient_sky()
draw_stars(60)
draw_moon(300, 200, 35)

bldgs = []
bx = -440
while bx < 440:
    w, h = random.randint(30,70), random.randint(80,250)
    bldgs.append((bx, w, h, random.choice(PAL["bldgs"])))
    bx += w + random.randint(2, 8)

for bx, w, h, c in bldgs:
    draw_building(bx, w, h, c)

draw_water()
draw_reflections(bldgs)

screen.update()
turtle.done()
