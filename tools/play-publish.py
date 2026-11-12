#!/usr/bin/env python3
"""Publish HomeDesigner to Google Play from the command line.

Uses the Google Play Developer Publishing API with a service account key kept
OUTSIDE the repo (default: ~/.secrets/homedesigner-play-sa.json, or set
PLAY_SA_KEY). Needs: pip install google-api-python-client google-auth

Every command is a dry run unless you pass --commit: it builds a Play "edit",
asks Google to validate it, then throws it away. With --commit the edit is
committed, which sends the changes for review (add --no-review to only stage
them as a draft in Play Console, like "Save" without "Send for review").

  python tools/play-publish.py status
  python tools/play-publish.py listing [--lang de-DE ...] [--commit]
  python tools/play-publish.py images [--commit]
  python tools/play-publish.py release --track internal [--notes "..."] [--commit]
  python tools/play-publish.py release --track production --rollout 0.2 --commit

Sources:
  listing  docs/PLAY_STORE_LISTING.txt   (<lang> blocks: App name / Short / Full)
  images   store/phone-*.png  (phone screenshots, in file-name order)
           store/feature-1024x500.png, store/icon-512.png
  release  android/app/build/outputs/bundle/release/app-release.aab
"""
import argparse
import glob
import io
import os
import re
import sys

PACKAGE = 'com.homedesigner.app'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = os.environ.get('PLAY_SA_KEY') or os.path.expanduser('~/.secrets/homedesigner-play-sa.json')
LISTING_FILE = os.path.join(ROOT, 'docs', 'PLAY_STORE_LISTING.txt')
AAB = os.path.join(ROOT, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab')
STORE = os.path.join(ROOT, 'store')
LIMITS = {'title': 30, 'shortDescription': 80, 'fullDescription': 4000}


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


def read_listings():
    text = io.open(LISTING_FILE, encoding='utf-8').read()
    out = {}
    for lang, body in re.findall(r'(?ms)^<([A-Za-z0-9-]+)>\n(.*?)\n</\1>', text):
        m = re.match(r'App name: (.*)\nShort description: (.*)\nFull description:\n(.*)\Z', body, re.S)
        if not m:
            sys.exit('Malformed block for %s in %s' % (lang, LISTING_FILE))
        item = {'title': m.group(1).strip(), 'shortDescription': m.group(2).strip(),
                'fullDescription': m.group(3).strip()}
        for field, limit in LIMITS.items():
            if u16(item[field]) > limit:
                sys.exit('%s %s is %d chars (limit %d)' % (lang, field, u16(item[field]), limit))
        out[lang] = item
    if not out:
        sys.exit('No <lang> blocks found in %s' % LISTING_FILE)
    return out


class Edit:
    """One Play edit: changes are invisible until commit; discarded otherwise."""

    def __init__(self, api):
        self.api = api
        self.e = api.edits()
        self.id = self.e.insert(packageName=PACKAGE, body={}).execute()['id']

    def finish(self, commit, no_review):
        self.e.validate(packageName=PACKAGE, editId=self.id).execute()
        if not commit:
            self.e.delete(packageName=PACKAGE, editId=self.id).execute()
            print('Dry run OK: Google validated the changes. Nothing was saved. Add --commit to apply.')
            return
        kw = {'changesNotSentForReview': True} if no_review else {}
        self.e.commit(packageName=PACKAGE, editId=self.id, **kw).execute()
        print('Committed.' + (' Staged in Play Console, not sent for review.' if no_review
                              else ' Sent for review.'))


def cmd_status(api, args):
    ed = Edit(api)
    try:
        details = ed.e.details().get(packageName=PACKAGE, editId=ed.id).execute()
        print('Default language:', details.get('defaultLanguage'))
        langs = ed.e.listings().list(packageName=PACKAGE, editId=ed.id).execute().get('listings', [])
        print('Listings (%d):' % len(langs))
        for l in langs:
            print('  %-7s %s' % (l['language'], l.get('title', '')))
        for t in ed.e.tracks().list(packageName=PACKAGE, editId=ed.id).execute().get('tracks', []):
            for r in t.get('releases', []):
                frac = r.get('userFraction')
                print('Track %-11s %-10s versions %s%s' % (
                    t['track'], r.get('status'), ','.join(r.get('versionCodes', [])) or '-',
                    ' (%.0f%%)' % (frac * 100) if frac else ''))
    finally:
        ed.e.delete(packageName=PACKAGE, editId=ed.id).execute()


def cmd_listing(api, args):
    listings = read_listings()
    langs = args.lang or list(listings)
    unknown = [l for l in langs if l not in listings]
    if unknown:
        sys.exit('Not in %s: %s' % (os.path.relpath(LISTING_FILE, ROOT), ', '.join(unknown)))
    ed = Edit(api)
    try:
        for lang in langs:
            ed.e.listings().update(packageName=PACKAGE, editId=ed.id, language=lang,
                                   body=dict(listings[lang], language=lang)).execute()
            print('  %-7s %s' % (lang, listings[lang]['title']))
        print('%d listing(s) updated in the edit.' % len(langs))
        ed.finish(args.commit, args.no_review)
    except Exception:
        ed.e.delete(packageName=PACKAGE, editId=ed.id).execute()
        raise


def cmd_images(api, args):
    from googleapiclient.http import MediaFileUpload
    phones = sorted(glob.glob(os.path.join(STORE, 'phone-*.png')))
    if not phones:
        sys.exit('No store/phone-*.png files.')
    ed = Edit(api)
    try:
        lang = args.lang or ed.e.details().get(packageName=PACKAGE, editId=ed.id).execute()['defaultLanguage']
        imgs = ed.e.images()

        def put(kind, path):
            imgs.upload(packageName=PACKAGE, editId=ed.id, language=lang, imageType=kind,
                        media_body=MediaFileUpload(path, mimetype='image/png')).execute()
            print('  %-16s %s' % (kind, os.path.relpath(path, ROOT)))

        imgs.deleteall(packageName=PACKAGE, editId=ed.id, language=lang, imageType='phoneScreenshots').execute()
        for p in phones:
            put('phoneScreenshots', p)
        for kind, name in (('featureGraphic', 'feature-1024x500.png'), ('icon', 'icon-512.png')):
            path = os.path.join(STORE, name)
            if os.path.exists(path):
                put(kind, path)
        print('Images replaced for %s.' % lang)
        ed.finish(args.commit, args.no_review)
    except Exception:
        ed.e.delete(packageName=PACKAGE, editId=ed.id).execute()
        raise


def cmd_release(api, args):
    from googleapiclient.http import MediaFileUpload
    aab = args.aab or AAB
    if not os.path.exists(aab):
        sys.exit('No bundle at %s. Build it first (npm run build, then gradlew bundleRelease).' % aab)
    if args.rollout is not None and not (0 < args.rollout <= 1):
        sys.exit('--rollout is a fraction between 0 and 1, e.g. 0.2 for 20%.')
    ed = Edit(api)
    try:
        print('Uploading %s (%.1f MB)...' % (os.path.relpath(aab, ROOT), os.path.getsize(aab) / 1e6))
        bundle = ed.e.bundles().upload(
            packageName=PACKAGE, editId=ed.id,
            media_body=MediaFileUpload(aab, mimetype='application/octet-stream', resumable=True)).execute()
        code = str(bundle['versionCode'])
        print('Bundle accepted: versionCode', code)
        release = {'versionCodes': [code], 'status': 'completed'}
        if args.draft:
            release['status'] = 'draft'
        elif args.rollout is not None and args.rollout < 1:
            release.update(status='inProgress', userFraction=args.rollout)
        if args.notes:
            lang = ed.e.details().get(packageName=PACKAGE, editId=ed.id).execute()['defaultLanguage']
            release['releaseNotes'] = [{'language': lang, 'text': args.notes}]
        ed.e.tracks().update(packageName=PACKAGE, editId=ed.id, track=args.track,
                             body={'track': args.track, 'releases': [release]}).execute()
        print('Track %s -> versionCode %s (%s%s)' % (
            args.track, code, release['status'],
            ', %.0f%%' % (args.rollout * 100) if release.get('userFraction') else ''))
        ed.finish(args.commit, args.no_review)
    except Exception:
        ed.e.delete(packageName=PACKAGE, editId=ed.id).execute()
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
            s.add_argument('--lang', nargs='+', help='only these languages (default: all in the file)')
        if name == 'images':
            s.add_argument('--lang', help='listing language (default: the default language)')
        if name == 'release':
            s.add_argument('--track', required=True, help='internal, alpha, beta or production')
            s.add_argument('--rollout', type=float, help='staged rollout fraction, e.g. 0.2')
            s.add_argument('--draft', action='store_true', help='create the release as a draft')
            s.add_argument('--notes', help='release notes for the default language')
            s.add_argument('--aab', help='path to the .aab (default: the gradle release output)')
    args = p.parse_args()
    for stream in (sys.stdout, sys.stderr):  # Windows consoles default to a legacy code page
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(encoding='utf-8', errors='replace')
    api = service()
    try:
        {'status': cmd_status, 'listing': cmd_listing, 'images': cmd_images, 'release': cmd_release}[args.cmd](api, args)
    except Exception as e:  # HttpError carries Google's explanation
        detail = getattr(e, 'reason', None) or str(e)
        sys.exit('Play API error: %s' % detail)


if __name__ == '__main__':
    main()
