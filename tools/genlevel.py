# Generates app/oribu/level.js (Rooftop Run). Edit layout here or edit the strings directly.
O=4; H=26; W=168
g=[[' ']*W for _ in range(H)]
def fill(x0,x1,top,bot=H-1,ch='#'):
    for x in range(x0,x1+1):
        for y in range(top+O if top is not None else 0, min(bot+O,H-1)+1 if bot!=H-1 else H):
            g[y][x]=ch
def put(x,y,ch): g[y+O][x]=ch
# S1 jump: gaps 2,3,4 then a 3-tile step (needs held jump)
fill(0,13,15); fill(16,21,15); fill(25,30,15); fill(35,40,18); fill(41,52,15)
put(2,14,'S'); put(4,14,'C')
# S2 chimney: left wall hangs (walk under), right wall climbs to roof F
fill(53,53,2,10,'W'); fill(53,56,15); fill(57,57,5,H-1,'W'); fill(58,75,5)
put(48,14,'C')
# S3 swing: first gap has a bounce awning floor, then 3 swings over alley
put(62,4,'C')
fill(76,81,16); fill(76,81,15,15,'^'); put(79,0,'o')
fill(82,88,6); put(84,5,'C'); put(92,1,'o'); put(96,1,'o'); put(102,1,'o'); fill(105,122,8)
# S4 combo: wall shaft -> swing -> pigeon bop -> finish ledge
put(110,7,'C'); fill(119,119,-3,4,'W'); fill(123,123,1,H-1,'W'); fill(124,130,1)
put(134,-2,'o'); fill(137,150,9); put(146,8,'p'); fill(151,160,4); put(156,3,'F')
fill(161,167,-4,H-1,'#')
balloons=[(9,13),(15,12),(23,12),(33,14),(44,13),(50,14),(55,11),(55,7),(55,4),(66,4),(78,3),(79,13),(92,4),(96,4),(102,4),(115,7),(121,1),(132,0),(142,7),(154,3)]
for x,y in balloons: put(x,y,'b')
rows=[''.join(r) for r in g]
assert sum(r.count('b') for r in rows)==20
js="// Rooftop Run — tile map. 32px tiles. Legend:\n// # roof  W clingable wall (mint stripe)  ^ bounce awning  o swing anchor  b balloon\n// S start  C checkpoint flag  F finish flag  p pigeon\nexport const LEVEL = { name: \"Rooftop Run\", rows: [\n"+",\n".join('  '+repr(r).replace("'",'"') for r in rows)+"\n] };\n"
open('/workspace/puzzles/app/oribu/level.js','w').write(js)
print('\n'.join(rows))
