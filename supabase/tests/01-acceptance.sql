\set ON_ERROR_STOP off
insert into auth.users (id,email) values
  ('11111111-1111-1111-1111-111111111111','teacher@school.edu'),
  ('22222222-2222-2222-2222-222222222222','student@eduquest.invalid') on conflict do nothing;
insert into public.teachers (user_id,email) values ('11111111-1111-1111-1111-111111111111','teacher@school.edu') on conflict do nothing;
insert into public.classes (code,name) values ('11SOC','Y11 Sociology') on conflict do nothing;

\echo ''
\echo '### 1. STUDENT HANDS IN WORK (anon, no RETURNING -- as the module now does)'
begin; set local role anon;
  insert into public.posts (class_code,student_name,word_count,body) values ('11SOC','ALICE',120,'Alice essay');
  insert into public.submissions (class_code,student_name,lesson,round,flag,tags,sentences)
    values ('11SOC','BOB','L1',0,'green','{clause}','["a sentence"]');
  insert into public.survey_responses (survey_key,payload) values ('sociology_survey_2026','{"q1":"yes"}');
commit;

\echo ''
\echo '### 2. STUDENT TRIES TO READ THE CLASS DROP BOX (expect 0 everywhere)'
begin; set local role anon;
  select (select count(*) from public.posts)            as posts,
         (select count(*) from public.submissions)      as submissions,
         (select count(*) from public.survey_responses) as surveys,
         (select count(*) from public.students)         as students;
commit;

\echo ''
\echo '### 3. STUDENT TRIES INSERT *WITH* RETURNING (expect: blocked -- documents why)'
begin; set local role anon;
  insert into public.posts (class_code,student_name,word_count,body) values ('11SOC','MALLORY',1,'x') returning id;
rollback;

\echo ''
\echo '### 4. TEACHER READS EVERYTHING (expect 1/1/1)'
begin; set local role authenticated; set local "test.uid" = '11111111-1111-1111-1111-111111111111';
  select (select count(*) from public.posts)            as posts,
         (select count(*) from public.submissions)      as submissions,
         (select count(*) from public.survey_responses) as surveys;
commit;

\echo ''
\echo '### 5. LOGGED-IN STUDENT IS NOT A TEACHER (expect 0)'
begin; set local role authenticated; set local "test.uid" = '22222222-2222-2222-2222-222222222222';
  select count(*) as posts_visible_to_student from public.posts;
commit;

\echo ''
\echo '### 6. STUDENT CANNOT PROMOTE THEMSELF TO TEACHER (expect: denied)'
begin; set local role authenticated; set local "test.uid" = '22222222-2222-2222-2222-222222222222';
  insert into public.teachers (user_id,email) values ('22222222-2222-2222-2222-222222222222','hacker@x.com');
rollback;

\echo ''
\echo '### 7. ABUSE CEILING on body length (expect: check violation)'
begin; set local role anon;
  insert into public.posts (class_code,student_name,word_count,body)
    values ('11SOC','SPAM',1,repeat('x',200001));
rollback;
