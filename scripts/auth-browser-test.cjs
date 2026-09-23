const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/tmp/dzwonek-browser/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.request.post('http://127.0.0.1:8001/api/login',{headers:{'X-Dzwonek':'1'},data:{password:'browser-test-password'}});
 for(const c of await (await page.request.get('http://127.0.0.1:8001/api/children')).json()) await page.request.delete('http://127.0.0.1:8001/api/children/'+c.id,{headers:{'X-Dzwonek':'1'}});
 await page.request.post('http://127.0.0.1:8001/api/logout',{headers:{'X-Dzwonek':'1'}});
 await page.goto('http://127.0.0.1:8001');
 await page.getByRole('button',{name:'Połącz swoją rodzinę →'}).click();
 await page.locator('#family-password').fill('browser-test-password');
 await page.locator('#login-form button[type=submit]').click();
 await page.getByRole('heading',{name:'Zacznijmy od pierwszego dziecka'}).waitFor();
 for(const name of ['Zosia','Antek']){
  await page.locator('.empty button[data-action=add], .profile-add').first().click();
  await page.locator('#child-name').fill(name);
  await page.locator('#librus-user').fill('fixture-user');
  await page.locator('#librus-password').fill('fixture-password');
  if(name==='Zosia'){await page.locator('#child-photo').setInputFiles('app/static/icon-192.png');await page.locator('.photo-preview img').waitFor();}
  await page.locator('#profile-form button[type=submit]').click();
  await page.locator('#modal').waitFor({state:'hidden'});
  await page.locator('.lesson').first().waitFor();
 }
 if(await page.locator('.profile-card img').count()!==1)throw Error('photo not saved');
 await page.getByRole('button',{name:'Moja rodzina'}).click();
 await page.getByRole('button',{name:'Edytuj profil'}).first().click();
 await page.locator('#child-name').fill('Zosia 2');
 await page.getByRole('button',{name:'Zielony',exact:true}).click();
 await page.locator('#profile-form button[type=submit]').click();
 await page.locator('#modal').waitFor({state:'hidden'});
 await page.getByRole('heading',{name:'Zosia 2',exact:true}).waitFor();
 await page.getByRole('button',{name:'Usuń',exact:true}).last().click();
 await page.getByRole('button',{name:'Usuń profil',exact:true}).click();
 await page.locator('#modal').waitFor({state:'hidden'});
 await page.waitForFunction(()=>document.querySelectorAll('.settings-card').length===2);
 await page.getByRole('button',{name:'Wyloguj się',exact:true}).click();
 await page.getByRole('button',{name:'Połącz swoją rodzinę →'}).waitFor();
 if((await page.request.get('http://127.0.0.1:8001/api/children')).status()!==401)throw Error('logout did not invalidate session');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: login, empty onboarding, two children, photo upload, edit color/name, deletion, logout.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
