import json, pathlib
out=pathlib.Path('src/data')
brands=['Hot Wheels','Mini GT','Matchbox','Majorette','Bburago','CCA','Inno64','Pop Race','Tomica']
models=['Nissan Skyline GT-R (R34)','Porsche 911 GT3 RS','1969 Chevrolet Camaro','Toyota Supra (A80)','Lamborghini Huracán','Ford Mustang GT','Mazda RX-7','Ferrari F40','Honda Civic Type R','Datsun 510','McLaren 720S','Mercedes-Benz 190E','BMW M3 E30','Dodge Charger R/T','Audi RS6 Avant','Toyota AE86','Land Rover Defender','Pagani Huayra','Nissan Silvia S15','Volkswagen Golf GTI']
colors=['#ef3340','#c5d7df','#f4c13d','#55b39b','#4888cf','#e8893c','#9179b8','#f1f0e7','#434b57']
products=[]
for i in range(60):
 b=brands[i%9];rare=i%11==0 or i%17==0
 series=('RLC' if i%22==0 else 'Treasure Hunt') if b=='Hot Wheels' and rare else ('Mainline' if b=='Hot Wheels' and i%3 else 'Premium' if b=='Hot Wheels' else 'Chase' if rare else 'Collector Series' if i%2 else 'Street Icons')
 price=([199,1299,249,399,2499,799,1599,1199,699][i%9])+ (i//18)*100
 if rare: price=[2499,4999,8999,12999,29999][(i//11)%5]
 p={'id':f'p{i+1:03}','sku':f'TK-{i+1:04}','name':models[i%20], 'brand':b,'series':series,'scale':['1:64','1:64','1:64','1:43','1:24','1:32','1:64','1:64','1:18'][i%9],'condition':['New','New','New','New','Card damaged','Pre-owned'][i%6],'price':price,'mrp':int(price*1.2)//50*50+49,'stock':0 if i%13==7 else 2 if i%7==2 else 8+i%19,'threshold':3,'rare':rare,'image':f'assets/products/car-{i%9}.webp','color':colors[i%9], 'description':f'A shelf-worthy {models[i%20]} in miniature. Detailed diecast body, precision wheels and a collector-approved finish. Packed carefully for the journey to your collection. Demo artwork is illustrative; packaging and colour may vary.','arrival':60-i,'sold':30+(i*17)%210,'offer':'bundle' if price<=399 else 'b2g1' if i%4==0 else ''}
 products.append(p)
# A balanced first row: the first item is affordable and in stock, rare finds still plentiful.
products[0].update(price=249,mrp=349,rare=False,series='Mainline',offer='bundle')
products[5].update(price=149,mrp=249,offer='bundle')
(out/'products.json').write_text(json.dumps(products,ensure_ascii=False,indent=2))
users=[]
for i,(name,phone,city,state,pin,line) in enumerate([('Arjun Mehta','9876500001','Bengaluru','Karnataka','560001','24, Church Street'),('Priya Sharma','9876500002','Mumbai','Maharashtra','400001','18, Marine Lines'),('Karthik Rao','9876500003','Hyderabad','Telangana','500001','7, Abids Road')]):
 users.append({'id':f'u{i+1}','name':name,'phone':phone,'email':name.lower().replace(' ','.')+'@example.com','role':'customer','addresses':[{'id':f'a{i+1}','name':name,'phone':phone,'line':line,'city':city,'state':state,'pin':pin}]})
users.append({'id':'admin','name':'Tiny Kars Admin','phone':'9876500099','email':'admin@example.com','role':'admin','addresses':[]})
(out/'users.json').write_text(json.dumps(users,indent=2))
statuses=['Delivered','Shipped','Confirmed','Packed','Placed','Cancelled','Return requested','Refunded','Out for delivery']
orders=[]
for i in range(25):
 p=products[(i*3)%60];q=1+i%2;status=statuses[i%9];address=users[i%3]['addresses'][0]
 orders.append({'id':f'TK-2609-{1001+i}','userId':f'u{i%3+1}','items':[{'productId':p['id'],'name':p['name'],'sku':p['sku'],'price':p['price'],'quantity':q,'image':p['image']}],'subtotal':p['price']*q,'discount':0,'shipping':0 if p['price']*q>=1499 else 79,'total':p['price']*q+(0 if p['price']*q>=1499 else 79),'gst':round(p['price']*q*18/118,2),'status':status,'daysAgo':i%24,'payment':['UPI','Card','COD'][i%3],'paid':status not in ['Placed','Shipped','Packed','Confirmed'],'address':address,'tracking':f'DEMO{i+100001}','courier':'Demo Express','stockRestored':status in ['Cancelled','Refunded']})
(out/'orders.json').write_text(json.dumps(orders,indent=2))
(out/'settings.json').write_text(json.dumps({'coupons':[{'code':'TINY10','percent':10,'min':499,'enabled':True},{'code':'FIRST15','percent':15,'min':999,'enabled':True},{'code':'COLLECT5','percent':5,'min':0,'enabled':False}], 'offers':[{'id':'bundle','name':'Any 3 for ₹550','description':'On marked Starter Garage models. Automatically applied in groups of three.','enabled':True},{'id':'b2g1','name':'Buy 2, get 1 free','description':'On marked collector models. Lowest-priced item free in each group of three.','enabled':True}]},ensure_ascii=False,indent=2))
