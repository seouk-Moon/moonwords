import test from 'node:test';import assert from 'node:assert/strict';
import { validatePhoto, clampPhotoCrop, photoCropFromPoints } from '../src/features/upload/photo-utils.ts';
test('photo validation allows camera/album formats and rejects empty, oversized and non-images',()=>{
  validatePhoto({name:'IMG.HEIC',type:'',size:1024});validatePhoto({name:'capture',type:'image/jpeg',size:1024});
  for(const file of [{name:'a.pdf',type:'application/pdf',size:1},{name:'x.jpg',type:'image/jpeg',size:0},{name:'x.jpg',type:'image/jpeg',size:30*1024*1024}])assert.throws(()=>validatePhoto(file));
});
test('crop accepts either drag direction and stays inside the photo for numeric controls',()=>{
  assert.deepEqual(photoCropFromPoints({x:.8,y:.9},{x:.2,y:.1}),{x:.2,y:.1,width:.6000000000000001,height:.8});
  const crop=clampPhotoCrop({x:2,y:-1,width:NaN,height:2});
  assert.ok(crop.x>=0&&crop.y>=0);assert.ok(crop.width>0&&crop.height>0);assert.ok(crop.x+crop.width<=1&&crop.y+crop.height<=1);
});
