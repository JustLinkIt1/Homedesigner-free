#!/usr/bin/env python3
"""Publish an Android app to Google Play from the command line.

The same script lives in HomeDesigner and Battle Crew; only the APP block below
differs. It talks to the Google Play Developer Publishing API as a service
account whose JSON key stays OUTSIDE the repo (APP['key'], or set PLAY_SA_KEY).
Needs: python -m pip install --user google-api-python-client google-auth

Every command is a dry run unless you pass --commit: it builds a Play "edit",
asks Google to validate it, then throws it away. With --commit the edit is
committed, which sends the changes for review (add --no-review to only stage
them in Play Console, to send from Publishing overview later).

  python tools/play-publish.py status
  python tools/play-publish.py release --track internal [--commit]
  python tools/play-publish.py release --track production --rollout 0.2 --commit
  python tools/play-publish.py listing [--file F] [--lang de-DE ...] [--commit]
  python tools/play-publish.py images [--screens DIR] [--commit]

release  uploads the gradle bundleRelease output (or --aab) and puts it on the
         track. Release notes come from --notes-file (or the app's default notes
         file for the current versionName), as <lang>...</lang> blocks, or
         --notes "text" for the default language only.
listing  <lang> blocks: "App name: / Short description: / Full description:".
images   phone screenshots (file-name order), feature graphic and icon.

Play's edits start from what is PUBLISHED, not from unsent drafts made in the
Play Console web UI: committing here can replace such a draft. Send or discard
web-UI drafts first.
"""
import argparse
import glob
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---- per-app settings -------------------------------------------------------
APP = {
    'package': 'com.homedesigner.app',
    'key': '~/.secrets/homedesigner-play-sa.json',
    'listing_file': 'docs/PLAY_STORE_LISTING.txt',
    'notes_file': None,                      # e.g. 'promo/release-notes-{version}.txt'
    'screens': 'store/phone-*.png',
    'feature_graphic': 'store/feature-1024x500.png',
    'icon': 'store/icon-512.png',
}
# -----------------------------------------------------------------------------

KEY = os.path.expanduser(os.environ.get('PLAY_SA_KEY') or APP['key'])
PACKAGE = APP['package']
AAB = os.path.join(ROOT, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab')
GRADLE = os.path.join(ROOT, 'android', 'app', 'build.gradle')
LIMITS = {'title': 30, 'shortDescription': 80, 'fullDescription': 4000}
NOTES_LIMIT = 500


def rel(path):
    return os.path.join(ROOT, path) if path and not os.path.isabs(path) else path


def service():
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError:
        sys.exit('Missing libraries: python -m pip install --user google-api-python-client google-auth')
    if not os.path.exists(KEY):
        sys.exit('No service account key at %s (set PLAY_SA_KEY to override).' % KEY)
    creds = service_account.Credentials.from_service_account_file(
        KEY, scopes=['https://www.googleapis.com/auth/androidpublisher'])
    return build('androidpublisher', 'v3', credentials=creds, cache_discovery=False)


def u16(s):
    return len(s.encode('utf-16-le')) // 2


def gradle_version():
    text = io.open(GRADLE, encoding='utf-8').read()
    code = re.search(r'^\s*versionCode\s+(\d+)', text, re.M)
    name = re.search(r'^\s*versionName\s+"([^"]+)"', text, re.M)
    return (code and code.group(1)), (name and name.group(1))


def lang_blocks(path):
    text = io.open(path, encoding='utf-8').read().replace('\r\n', '\n')
    blocks = re.findall(r'(?ms)^<([A-Za-z0-9-]+)>\n(.*?)\n</\1>', text)
    if not blocks:
        sys.exit('No <lang>...</lang> blocks found in %s' % path)
    return [(lang, body.strip()) for lang, body in blocks]


def read_listings(path):
    out = {}
    for lang, body in lang_blocks(path):
        m = re.match(r'App name: (.*)\nShort description: (.*)\nFull description:\n(.*)\Z', body, re.S)
        if not m:
            sys.exit('Malformed listing block for %s in %s' % (lang, path))
        item = {'title': m.group(1).strip(), 'shortDescription': m.group(2).strip(),
                'fullDescription': m.group(3).strip()}
        for field, limit in LIMITS.items():
            if u16(item[field]) > limit:
                sys.exit('%s %s is %d chars (limit %d)' % (lang, field, u16(item[field]), limit))
        out[lang] = item
    return out


def read_notes(path):
    notes = []
    for lang, text in lang_blocks(path):
        if u16(text) > NOTES_LIMIT:
            sys.exit('%s release notes are %d chars (limit %d)' % (lang, u16(text), NOTES_LIMIT))
        notes.append({'language': lang, 'text': text})
    return notes


class Edit:
    """One Play edit: changes are invisible until commit and discarded otherwise."""

    def __init__(self, api):
        self.e = api.edits()
        self.id = self.e.insert(packageName=PACKAGE, body={}).execute()['id']

    def default_language(self):
        return self.e.details().get(packageName=PACKAGE, editId=self.id).execute()['defaultLanguage']

    def discard(self):
        try:
            self.e.delete(packageName=PACKAGE, editId=self.id).execute()
        except Exception:
            pass

    def finish(self, commit, no_review):
        self.e.validate(packageName=PACKAGE, editId=self.id).execute()
        if not commit:
            self.discard()
            print('Dry run OK: Google validated the changes. Nothing was saved. Add --commit to apply.')
            return
        kw = {'changesNotSentForReview': True} if no_review else {}
        self.e.commit(packageName=PACKAGE, editId=self.id, **kw).execute()
        print('Committed.' + (' Staged in Play Console, not sent for review.' if no_review
                              else ' Sent for review.'))


def cmd_status(api, args):
    ed = Edit(api)
    try:
        print('Package:', PACKAGE, ' local build.gradle: versionCode %s, versionName %s' % gradle_version())
        print('Default language:', ed.default_language())
        langs = ed.e.listings().list(packageName=PACKAGE, editId=ed.id).execute().get('listings', [])
        print('Listings (%d): %s' % (len(langs), ' '.join(l['language'] for l in langs)))
        for t in ed.e.tracks().list(packageName=PACKAGE, editId=ed.id).execute().get('tracks', []):
            for r in t.get('releases', []):
                frac = r.get('userFraction')
                print('Track %-16s %-11s versions %-8s %s%s' % (
                    repr(t['track']), r.get('status'), ','.join(r.get('versionCodes', [])) or '-',
                    r.get('name', ''), ' (%.0f%%)' % (frac * 100) if frac else ''))
    finally:
        ed.discard()


def cmd_listing(api, args):
    path = rel(args.file or APP['listing_file'])
    if not path or not os.path.exists(path):
        sys.exit('No listing file; pass --file (see the docstring for the format).')
    listings = read_listings(path)
    langs = args.lang or list(listings)
    unknown = [l for l in langs if l not in listings]
    if unknown:
        sys.exit('Not in %s: %s' % (path, ', '.join(unknown)))
    ed = Edit(api)
    try:
        for lang in langs:
            ed.e.listings().update(packageName=PACKAGE, editId=ed.id, language=lang,
                                   body=dict(listings[lang], language=lang)).execute()
            print('  %-7s %s' % (lang, listings[lang]['title']))
        print('%d listing(s) updated in the edit.' % len(langs))
        ed.finish(args.commit, args.no_review)
    except BaseException:
        ed.discard()
        raise


def cmd_images(api, args):
    from googleapiclient.http import MediaFileUpload
    pattern = os.path.join(rel(args.screens), '*.png') if args.screens else rel(APP['screens'])
    phones = sorted(glob.glob(pattern)) if pattern else []
    if not phones:
        sys.exit('No screenshots match %s (pass --screens DIR).' % pattern)
    ed = Edit(api)
    try:
        lang = args.lang or ed.default_language()
        imgs = ed.e.images()

        def put(kind, path):
            imgs.upload(packageName=PACKAGE, editId=ed.id, language=lang, imageType=kind,
                        media_body=MediaFileUpload(path, mimetype='image/png')).execute()
            print('  %-16s %s' % (kind, os.path.relpath(path, ROOT)))

        imgs.deleteall(packageName=PACKAGE, editId=ed.id, language=lang, imageType='phoneScreenshots').execute()
        for p in phones:
            put('phoneScreenshots', p)
        for kind in ('featureGraphic', 'icon'):
            path = rel(APP['feature_graphic' if kind == 'featureGraphic' else 'icon'])
            if path and os.path.exists(path):
                put(kind, path)
        print('Images replaced for %s.' % lang)
        ed.finish(args.commit, args.no_review)
    except BaseException:
        ed.discard()
        raise


def cmd_release(api, args):
    from googleapiclient.http import MediaFileUpload
    aab = rel(args.aab) if args.aab else AAB
    if not os.path.exists(aab):
        sys.exit('No bundle at %s. Build it first (gradlew bundleRelease).' % aab)
    if args.rollout is not None and not (0 < args.rollout <= 1):
        sys.exit('--rollout is a fraction between 0 and 1, e.g. 0.2 for 20%.')
    code, name = gradle_version()
    notes_path = rel(args.notes_file) if args.notes_file else (
        rel(APP['notes_file'].format(version=name)) if APP['notes_file'] and name else None)
    notes = read_notes(notes_path) if notes_path and os.path.exists(notes_path) else None
    if args.notes_file and notes is None:
        sys.exit('Notes file not found: %s' % notes_path)
    ed = Edit(api)
    try:
        print('Uploading %s (%.1f MB; build.gradle says versionCode %s, %s)...' % (
            os.path.relpath(aab, ROOT), os.path.getsize(aab) / 1e6, code, name))
        bundle = ed.e.bundles().upload(
            packageName=PACKAGE, editId=ed.id,
            media_body=MediaFileUpload(aab, mimetype='application/octet-stream',
                                       resumable=True, chunksize=8 * 1024 * 1024)).execute()
        uploaded = str(bundle['versionCode'])
        print('Bundle accepted: versionCode', uploaded)
        release = {'versionCodes': [uploaded], 'status': 'completed'}
        if name:
            release['name'] = '%s (%s)' % (name, uploaded)
        if args.draft:
            release['status'] = 'draft'
        elif args.rollout is not None and args.rollout < 1:
            release.update(status='inProgress', userFraction=args.rollout)
        if notes:
            release['releaseNotes'] = notes
            print('Release notes: %d languages from %s' % (len(notes), os.path.relpath(notes_path, ROOT)))
        elif args.notes:
            release['releaseNotes'] = [{'language': ed.default_language(), 'text': args.notes}]
        else:
            print('No release notes.')
        ed.e.tracks().update(packageName=PACKAGE, editId=ed.id, track=args.track,
                             body={'track': args.track, 'releases': [release]}).execute()
        print('Track %r -> versionCode %s (%s%s)' % (
            args.track, uploaded, release['status'],
            ', %.0f%%' % (args.rollout * 100) if release.get('userFraction') else ''))
        ed.finish(args.commit, args.no_review)
    except BaseException:
        ed.discard()
        raise


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    sub.add_parser('status', help='show listings and tracks (read-only)')
    for name in ('listing', 'images', 'release'):
        s = sub.add_parser(name)
        s.add_argument('--commit', action='store_true', help='apply the edit (default: validate only)')
        s.add_argument('--no-review', action='store_true', help='with --commit: stage, do not send for review')
        if name == 'listing':
            s.add_argument('--file', help='listing file (default: %s)' % APP['listing_file'])
            s.add_argument('--lang', nargs='+', help='only these languages (default: all in the file)')
        if name == 'images':
            s.add_argument('--screens', help='folder of phone screenshot PNGs (default: %s)' % APP['screens'])
            s.add_argument('--lang', help='listing language (default: the default language)')
        if name == 'release':
            s.add_argument('--track', required=True,
                           help="internal, alpha, beta, production, or a closed track's name (see status)")
            s.add_argument('--rollout', type=float, help='staged rollout fraction, e.g. 0.2')
            s.add_argument('--draft', action='store_true', help='create the release as a draft')
            s.add_argument('--notes-file', help='<lang> blocks of release notes (default: %s)' % APP['notes_file'])
            s.add_argument('--notes', help='release notes for the default language only')
            s.add_argument('--aab', help='path to the .aab (default: the gradle release output)')
    args = p.parse_args()
    for stream in (sys.stdout, sys.stderr):  # Windows consoles default to a legacy code page
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(encoding='utf-8', errors='replace')
    api = service()
    try:
        {'status': cmd_status, 'listing': cmd_listing, 'images': cmd_images,
         'release': cmd_release}[args.cmd](api, args)
    except KeyboardInterrupt:
        sys.exit('Interrupted; the edit was discarded.')
    except Exception as e:  # HttpError carries Google's explanation
        detail = getattr(e, 'reason', None) or str(e)
        sys.exit('Play API error: %s' % detail)


if __name__ == '__main__':
    main()
