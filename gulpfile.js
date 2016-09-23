var gulp = require('gulp'),
  nodemon = require('gulp-nodemon'),
  plumber = require('gulp-plumber'),
  livereload = require('gulp-livereload'),
  sass = require('gulp-ruby-sass');
var sftp = require('gulp-sftp');
var credentials = require('./.ftpaccess.js');
var argv = require('yargs').argv;
var ENV = (argv.env === undefined)? 'development':argv.env;
var env = credentials.environments[ENV];
var filter = require('gulp-filter');
var uglify = require('gulp-uglify');
var path = require('path');

gulp.task('sass', function () {
  return sass('./public/css/**/*.scss')
    .pipe(gulp.dest('./public/css'))
    .pipe(livereload());
});

gulp.task('watch', function() {
  gulp.watch('./public/css/*.scss', ['sass']);
});

gulp.task('develop', function () {
  livereload.listen();
  nodemon({
    script: 'app.js',
    ext: 'js coffee marko',
    ignore: '*.marko.js',
    stdout: false
  }).on('readable', function () {
    this.stdout.on('data', function (chunk) {
      if(/^Express server listening on port/.test(chunk)){
        livereload.changed(__dirname);
      }
    });
    this.stdout.pipe(process.stdout);
    this.stderr.pipe(process.stderr);
  });
});

gulp.task('default', [
  'sass',
  'develop',
  'watch'
]);

gulp.task('upload', function () {
    
    return gulp.src([
                     path.join('./**/*'),
                     path.join('!' + './node_modules/**/*')
                   ])
        .pipe(sftp({
            host: env.sftp.host,
            user: env.sftp.user,
            pass: env.sftp.pass,
            remotePath:env.sftp.remotePath
        }));
});


gulp.task('deploy',['upload'], function () {
});