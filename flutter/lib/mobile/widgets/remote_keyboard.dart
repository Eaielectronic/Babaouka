import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_hbb/common.dart';
import 'package:flutter_hbb/models/input_model.dart';
import 'package:flutter_hbb/models/platform_model.dart';

const _kBg = Color(0xFF202124);
const _kKey = Color(0xFF3C4043);
const _kKeyPressed = Color(0xFF5F6368);
const _kSpecial = Color(0xFF2D2F33);
const _kAccent = Color(0xFF8AB4F8);
const _kAccentDark = Color(0xFF1A3A6B);
const _kKeyBorder = Color(0xFF4A4D51);
const _kLayoutOption = 'remote-kb-layout';

enum _Pad { letters, symbols, fn, numpad, shortcuts }

enum _Mod { ctrl, alt, shift, meta }

enum _ModMode { off, once, locked }

enum _Kind { char, special, mod, pad, caps, space }

class _Key {
  final String label;
  final String? shiftLabel;
  final String send;
  final String? shiftSend;
  final double flex;
  final _Kind kind;
  final _Mod? mod;
  final _Pad? pad;
  final IconData? icon;
  final bool repeat;

  const _Key._(this.label, this.send, this.flex, this.kind,
      {this.shiftLabel,
      this.shiftSend,
      this.mod,
      this.pad,
      this.icon,
      this.repeat = false});

  factory _Key.ch(String c, {String? shifted, double flex = 1}) =>
      _Key._(c, c, flex, _Kind.char,
          shiftLabel: shifted, shiftSend: shifted, repeat: true);

  factory _Key.sp(String label, String vk,
          {double flex = 1, IconData? icon, bool repeat = false}) =>
      _Key._(label, vk, flex, _Kind.special, icon: icon, repeat: repeat);

  factory _Key.mod(String label, _Mod m, {double flex = 1}) =>
      _Key._(label, '', flex, _Kind.mod, mod: m);

  factory _Key.pad(String label, _Pad p, {double flex = 1}) =>
      _Key._(label, '', flex, _Kind.pad, pad: p);

  factory _Key.space(double flex) =>
      _Key._('', 'VK_SPACE', flex, _Kind.space, repeat: true);

  factory _Key.caps(double flex) =>
      _Key._('', 'VK_CAPITAL', flex, _Kind.caps, icon: Icons.keyboard_capslock);
}

class _Shortcut {
  final String title;
  final String combo;
  final String key;
  final bool main;
  final bool alt;
  final bool shift;
  final bool meta;
  final bool ctrl;
  const _Shortcut(this.title, this.combo, this.key,
      {this.main = false,
      this.alt = false,
      this.shift = false,
      this.meta = false,
      this.ctrl = false});
}

const _shortcuts = <List<_Shortcut>>[
  [
    _Shortcut('Select All', 'Ctrl+A', 'a', main: true),
    _Shortcut('Copy', 'Ctrl+C', 'c', main: true),
    _Shortcut('Paste', 'Ctrl+V', 'v', main: true),
    _Shortcut('Cut', 'Ctrl+X', 'x', main: true),
  ],
  [
    _Shortcut('Undo', 'Ctrl+Z', 'z', main: true),
    _Shortcut('Redo', 'Ctrl+Y', 'y', main: true),
    _Shortcut('Save', 'Ctrl+S', 's', main: true),
    _Shortcut('Find', 'Ctrl+F', 'f', main: true),
  ],
  [
    _Shortcut('Switch window', 'Alt+Tab', 'VK_TAB', alt: true),
    _Shortcut('Close window', 'Alt+F4', 'VK_F4', alt: true),
    _Shortcut('Desktop', 'Win+D', 'd', meta: true),
    _Shortcut('Run', 'Win+R', 'r', meta: true),
  ],
  [
    _Shortcut('Ctrl+Alt+Del', '', '', ctrl: true, alt: true),
    _Shortcut('Task manager', 'Ctrl+Shift+Esc', 'VK_ESCAPE',
        ctrl: true, shift: true),
    _Shortcut('Print Screen', 'PrtSc', 'VK_SNAPSHOT'),
    _Shortcut('Lock screen', 'Win+L', 'l', meta: true),
  ],
];

List<_Key> _digits() =>
    [for (final d in '1234567890'.split('')) _Key.ch(d)];

List<_Key> _arrows() => [
      _Key.sp('', 'VK_LEFT', icon: Icons.keyboard_arrow_left, repeat: true),
      _Key.sp('', 'VK_DOWN', icon: Icons.keyboard_arrow_down, repeat: true),
      _Key.sp('', 'VK_UP', icon: Icons.keyboard_arrow_up, repeat: true),
      _Key.sp('', 'VK_RIGHT', icon: Icons.keyboard_arrow_right, repeat: true),
    ];

_Key _enter({double flex = 1}) =>
    _Key.sp('', 'VK_RETURN', flex: flex, icon: Icons.keyboard_return);

_Key _back({double flex = 1}) => _Key.sp('', 'VK_BACK',
    flex: flex, icon: Icons.backspace_outlined, repeat: true);

List<_Key> _bottomRow(_Pad current, bool isMac) => [
      current == _Pad.letters
          ? _Key.pad('#+=', _Pad.symbols, flex: 1.5)
          : _Key.pad('ABC', _Pad.letters, flex: 1.5),
      _Key.mod('Ctrl', _Mod.ctrl, flex: 1.25),
      _Key.mod(isMac ? 'Cmd' : 'Win', _Mod.meta),
      _Key.mod(isMac ? 'Opt' : 'Alt', _Mod.alt),
      _Key.space(4.25),
      ..._arrows(),
    ];

List<List<_Key>> _lettersPad(bool azerty, bool isMac) {
  final r2 = azerty ? 'azertyuiop' : 'qwertyuiop';
  final r3 = azerty ? 'qsdfghjklm' : 'asdfghjkl';
  final r4 = azerty ? 'wxcvbn' : 'zxcvbnm';
  return [
    [
      _Key.sp('Esc', 'VK_ESCAPE', flex: 1.4),
      ..._digits(),
      _Key.sp('Del', 'VK_DELETE', flex: 1.6, repeat: true),
    ],
    [
      _Key.sp('Tab', 'VK_TAB', flex: 1.4),
      for (final c in r2.split('')) _Key.ch(c),
      _back(flex: 1.6),
    ],
    [
      _Key.caps(1.7),
      for (final c in r3.split('')) _Key.ch(c),
      if (!azerty) _Key.ch(';', shifted: ':'),
      _enter(flex: 1.3),
    ],
    [
      _Key.mod('Shift', _Mod.shift, flex: 1.5),
      for (final c in r4.split('')) _Key.ch(c),
      if (azerty) ...[
        _Key.ch(',', shifted: ';'),
        _Key.ch('.', shifted: ':'),
        _Key.ch('?', shifted: '/'),
        _Key.ch('!', shifted: '§'),
      ] else ...[
        _Key.ch(',', shifted: '<'),
        _Key.ch('.', shifted: '>'),
        _Key.ch('/', shifted: '?'),
      ],
      _Key.mod('Shift', _Mod.shift, flex: 1.5),
    ],
    _bottomRow(_Pad.letters, isMac),
  ];
}

List<List<_Key>> _symbolsPad(bool isMac) {
  const top = [
    ['`', '~'],
    ['1', '!'],
    ['2', '@'],
    ['3', '#'],
    ['4', r'$'],
    ['5', '%'],
    ['6', '^'],
    ['7', '&'],
    ['8', '*'],
    ['9', '('],
    ['0', ')'],
    ['-', '_'],
    ['=', '+'],
  ];
  return [
    [for (final k in top) _Key.ch(k[0], shifted: k[1])],
    [
      _Key.sp('Tab', 'VK_TAB', flex: 1.5),
      for (final c in '[]{}()<>/\\'.split('')) _Key.ch(c),
      _back(flex: 1.5),
    ],
    [
      for (final c in '@#\$€£°%&*~^'.split('')) _Key.ch(c),
      _enter(flex: 2),
    ],
    [
      _Key.mod('Shift', _Mod.shift, flex: 1.5),
      for (final c in ';:\'",.?!_|'.split('')) _Key.ch(c),
      _Key.mod('Shift', _Mod.shift, flex: 1.5),
    ],
    _bottomRow(_Pad.symbols, isMac),
  ];
}

List<List<_Key>> _fnPad(bool isMac) => [
      [for (var i = 1; i <= 6; i++) _Key.sp('F$i', 'VK_F$i')],
      [for (var i = 7; i <= 12; i++) _Key.sp('F$i', 'VK_F$i')],
      [
        _Key.sp('Esc', 'VK_ESCAPE'),
        _Key.sp('Ins', 'VK_INSERT'),
        _Key.sp('Home', 'VK_HOME', repeat: true),
        _Key.sp('PgUp', 'VK_PRIOR', repeat: true),
        _Key.sp('PrtSc', 'VK_SNAPSHOT'),
        _Key.sp('Pause', 'VK_PAUSE'),
      ],
      [
        _Key.sp('Tab', 'VK_TAB'),
        _back(),
        _Key.sp('Del', 'VK_DELETE', repeat: true),
        _Key.sp('End', 'VK_END', repeat: true),
        _Key.sp('PgDn', 'VK_NEXT', repeat: true),
        _enter(),
      ],
      _bottomRow(_Pad.fn, isMac),
    ];

List<List<_Key>> _numpadPad(bool isMac) => [
      [
        _Key.sp('7', 'VK_NUMPAD7'),
        _Key.sp('8', 'VK_NUMPAD8'),
        _Key.sp('9', 'VK_NUMPAD9'),
        _Key.sp('/', 'VK_DIVIDE'),
        _back(),
      ],
      [
        _Key.sp('4', 'VK_NUMPAD4'),
        _Key.sp('5', 'VK_NUMPAD5'),
        _Key.sp('6', 'VK_NUMPAD6'),
        _Key.sp('*', 'VK_MULTIPLY'),
        _Key.sp('Del', 'VK_DELETE', repeat: true),
      ],
      [
        _Key.sp('1', 'VK_NUMPAD1'),
        _Key.sp('2', 'VK_NUMPAD2'),
        _Key.sp('3', 'VK_NUMPAD3'),
        _Key.sp('-', 'VK_SUBTRACT'),
        _Key.sp('Tab', 'VK_TAB'),
      ],
      [
        _Key.sp('0', 'VK_NUMPAD0', flex: 2),
        _Key.sp('.', 'VK_DECIMAL'),
        _Key.sp('+', 'VK_ADD'),
        _enter(),
      ],
      _bottomRow(_Pad.numpad, isMac),
    ];

class _CapPointer extends StatefulWidget {
  final Widget Function(bool pressed) builder;
  final VoidCallback onDown;
  final void Function(bool cancelled) onUp;
  final VoidCallback? onRepeat;

  const _CapPointer({
    required this.builder,
    required this.onDown,
    required this.onUp,
    this.onRepeat,
  });

  @override
  State<_CapPointer> createState() => _CapPointerState();
}

class _CapPointerState extends State<_CapPointer> {
  int? _pointer;
  bool _down = false;
  Timer? _delay;
  Timer? _repeat;

  void _stopTimers() {
    _delay?.cancel();
    _repeat?.cancel();
    _delay = null;
    _repeat = null;
  }

  void _onDown(PointerDownEvent e) {
    if (_pointer != null) return;
    _pointer = e.pointer;
    setState(() => _down = true);
    HapticFeedback.selectionClick();
    widget.onDown();
    if (widget.onRepeat != null) {
      _delay = Timer(const Duration(milliseconds: 420), () {
        _repeat = Timer.periodic(const Duration(milliseconds: 55), (_) {
          widget.onRepeat?.call();
        });
      });
    }
  }

  void _onEnd(PointerEvent e, bool cancelled) {
    if (e.pointer != _pointer) return;
    _pointer = null;
    _stopTimers();
    if (mounted) setState(() => _down = false);
    widget.onUp(cancelled);
  }

  @override
  void dispose() {
    _stopTimers();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      behavior: HitTestBehavior.opaque,
      onPointerDown: _onDown,
      onPointerUp: (e) => _onEnd(e, false),
      onPointerCancel: (e) => _onEnd(e, true),
      child: widget.builder(_down),
    );
  }
}

/// Full-width on-screen PC keyboard. Every key reacts to its own pointer, so
/// several keys (and modifiers) can be held at the same time with multi-touch.
class RemoteKeyboard extends StatefulWidget {
  final InputModel inputModel;
  final bool isMac;
  final bool Function() canSend;
  final VoidCallback onClose;

  const RemoteKeyboard({
    super.key,
    required this.inputModel,
    required this.isMac,
    required this.canSend,
    required this.onClose,
  });

  @override
  State<RemoteKeyboard> createState() => _RemoteKeyboardState();
}

class _RemoteKeyboardState extends State<RemoteKeyboard> {
  _Pad _pad = _Pad.letters;
  bool _azerty = true;
  bool _caps = false;
  final Map<_Mod, _ModMode> _mode = {for (final m in _Mod.values) m: _ModMode.off};
  final Set<_Mod> _held = {};
  final Set<_Mod> _usedWhileHeld = {};

  InputModel get _input => widget.inputModel;

  @override
  void initState() {
    super.initState();
    final saved = bind.mainGetLocalOption(key: _kLayoutOption);
    if (saved == 'qwerty') _azerty = false;
  }

  @override
  void dispose() {
    _held.clear();
    for (final m in _Mod.values) {
      _mode[m] = _ModMode.off;
    }
    _syncFlags();
    super.dispose();
  }

  bool _isOn(_Mod m) => _held.contains(m) || _mode[m] != _ModMode.off;

  bool get _shiftOn => _isOn(_Mod.shift);

  void _syncFlags() {
    _input.ctrl = _isOn(_Mod.ctrl);
    _input.alt = _isOn(_Mod.alt);
    _input.shift = _isOn(_Mod.shift);
    _input.command = _isOn(_Mod.meta);
  }

  void _afterKey() {
    for (final m in _Mod.values) {
      if (_held.contains(m)) _usedWhileHeld.add(m);
      if (_mode[m] == _ModMode.once) _mode[m] = _ModMode.off;
    }
    _syncFlags();
    if (mounted) setState(() {});
  }

  void _press(String name) {
    if (!widget.canSend()) return;
    _syncFlags();
    _input.inputKey(name);
  }

  void _sendKey(_Key k) {
    switch (k.kind) {
      case _Kind.char:
        final isLetter = RegExp(r'^[a-z]$').hasMatch(k.send);
        final useShifted = !isLetter && _shiftOn && k.shiftSend != null;
        _press(useShifted ? k.shiftSend! : k.send);
        break;
      case _Kind.caps:
        _caps = !_caps;
        _press(k.send);
        break;
      case _Kind.special:
      case _Kind.space:
        _press(k.send);
        break;
      case _Kind.mod:
      case _Kind.pad:
        return;
    }
    _afterKey();
  }

  void _modDown(_Mod m) {
    _held.add(m);
    _usedWhileHeld.remove(m);
    _syncFlags();
    setState(() {});
  }

  void _modUp(_Mod m, bool cancelled) {
    _held.remove(m);
    if (!cancelled && !_usedWhileHeld.contains(m)) {
      switch (_mode[m]!) {
        case _ModMode.off:
          _mode[m] = _ModMode.once;
          break;
        case _ModMode.once:
          _mode[m] = _ModMode.locked;
          break;
        case _ModMode.locked:
          _mode[m] = _ModMode.off;
          break;
      }
    }
    _usedWhileHeld.remove(m);
    _syncFlags();
    setState(() {});
  }

  void _runShortcut(_Shortcut s) {
    if (!widget.canSend()) return;
    final sessionId = _input.sessionId;
    if (s.key.isEmpty) {
      bind.sessionCtrlAltDel(sessionId: sessionId);
      return;
    }
    if (s.title == 'Paste') {
      Clipboard.getData(Clipboard.kTextPlain).then((data) {
        final text = data?.text;
        if (text != null && text.isNotEmpty) {
          bind.sessionInputString(sessionId: sessionId, value: text);
        } else {
          _combo(s);
        }
      });
      return;
    }
    _combo(s);
  }

  void _combo(_Shortcut s) {
    if (!_input.keyboardPerm) return;
    bind.sessionInputKey(
      sessionId: _input.sessionId,
      name: s.key,
      down: false,
      press: true,
      alt: s.alt,
      ctrl: s.ctrl || (s.main && !widget.isMac),
      shift: s.shift,
      command: s.meta || (s.main && widget.isMac),
    );
  }

  void _setLayout(bool azerty) {
    setState(() => _azerty = azerty);
    bind.mainSetLocalOption(key: _kLayoutOption, value: azerty ? 'azerty' : 'qwerty');
  }

  List<List<_Key>> _rows() {
    switch (_pad) {
      case _Pad.letters:
        return _lettersPad(_azerty, widget.isMac);
      case _Pad.symbols:
        return _symbolsPad(widget.isMac);
      case _Pad.fn:
        return _fnPad(widget.isMac);
      case _Pad.numpad:
        return _numpadPad(widget.isMac);
      case _Pad.shortcuts:
        return const [];
    }
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final isTablet = media.size.shortestSide >= 600;
    final landscape = media.size.width > media.size.height;
    final fraction = isTablet ? 0.30 : (landscape ? 0.55 : 0.36);
    final keyH = ((media.size.height * fraction - 44) / 5)
        .clamp(isTablet ? 46.0 : 34.0, isTablet ? 62.0 : 54.0)
        .toDouble();
    final gap = isTablet ? 6.0 : 4.0;

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: _kBg,
        border: const Border(top: BorderSide(color: _kKeyBorder, width: 1)),
      ),
      padding: EdgeInsets.fromLTRB(gap, 0, gap, gap),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildTabs(),
          if (_pad == _Pad.shortcuts)
            ..._buildShortcutRows(keyH, gap)
          else
            for (final row in _rows()) _buildRow(row, keyH, gap),
          if (_pad == _Pad.shortcuts)
            _buildRow(_bottomRow(_Pad.shortcuts, widget.isMac), keyH, gap),
        ],
      ),
    );
  }

  Widget _buildTabs() {
    Widget tab(String label, _Pad p, {IconData? icon}) {
      final selected = _pad == p;
      return InkWell(
        onTap: () => setState(() => _pad = p),
        child: Container(
          height: 40,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                  color: selected ? _kAccent : Colors.transparent, width: 2),
            ),
          ),
          child: icon != null
              ? Icon(icon, size: 18, color: selected ? _kAccent : Colors.white70)
              : Text(
                  label,
                  style: TextStyle(
                    color: selected ? _kAccent : Colors.white70,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
        ),
      );
    }

    Widget action(IconData icon, VoidCallback onTap, String tip) => Tooltip(
          message: tip,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(20),
            child: SizedBox(
              width: 40,
              height: 40,
              child: Icon(icon, size: 20, color: Colors.white70),
            ),
          ),
        );

    return SizedBox(
      height: 40,
      child: Row(
        children: [
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  tab('ABC', _Pad.letters),
                  tab('#+=', _Pad.symbols),
                  tab('Fn', _Pad.fn),
                  tab('Num', _Pad.numpad),
                  tab('', _Pad.shortcuts, icon: Icons.bolt),
                ],
              ),
            ),
          ),
          InkWell(
            onTap: () => _setLayout(!_azerty),
            borderRadius: BorderRadius.circular(6),
            child: Container(
              height: 26,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                border: Border.all(color: _kKeyBorder),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                _azerty ? 'AZERTY' : 'QWERTY',
                style: const TextStyle(color: Colors.white70, fontSize: 11),
              ),
            ),
          ),
          const SizedBox(width: 4),
          action(Icons.keyboard_hide_outlined, widget.onClose, translate('Close')),
        ],
      ),
    );
  }

  Widget _buildRow(List<_Key> keys, double h, double gap) {
    return Padding(
      padding: EdgeInsets.only(top: gap),
      child: SizedBox(
        height: h,
        child: Row(
          children: [
            for (var i = 0; i < keys.length; i++)
              Expanded(
                flex: (keys[i].flex * 100).round(),
                child: Padding(
                  padding: EdgeInsets.only(right: i == keys.length - 1 ? 0 : gap),
                  child: _buildKey(keys[i]),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _keyBody(
    Widget child, {
    required bool pressed,
    Color? color,
    Color? border,
  }) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 60),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: pressed ? _kKeyPressed : (color ?? _kKey),
        borderRadius: BorderRadius.circular(7),
        border: Border.all(color: border ?? Colors.transparent, width: 1.2),
      ),
      child: child,
    );
  }

  Widget _label(String text, {double size = 16, Color color = Colors.white}) {
    return FittedBox(
      fit: BoxFit.scaleDown,
      child: Text(
        text,
        maxLines: 1,
        style: TextStyle(
          color: color,
          fontSize: size,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }

  Widget _buildKey(_Key k) {
    switch (k.kind) {
      case _Kind.mod:
        final m = k.mod!;
        return _CapPointer(
          onDown: () => _modDown(m),
          onUp: (cancelled) => _modUp(m, cancelled),
          builder: (pressed) {
            final mode = _mode[m]!;
            final on = _isOn(m);
            final locked = mode == _ModMode.locked;
            return Stack(
              children: [
                Positioned.fill(
                  child: _keyBody(
                    _label(
                      k.label,
                      size: 13,
                      color: locked ? _kAccentDark : (on ? _kAccent : Colors.white),
                    ),
                    pressed: pressed && !on,
                    color: locked ? _kAccent : (on ? _kAccentDark : _kSpecial),
                    border: on ? _kAccent : _kKeyBorder,
                  ),
                ),
                if (locked)
                  const Positioned(
                    top: 3,
                    right: 4,
                    child: Icon(Icons.lock, size: 10, color: _kAccentDark),
                  ),
              ],
            );
          },
        );
      case _Kind.pad:
        return _CapPointer(
          onDown: () => setState(() => _pad = k.pad!),
          onUp: (_) {},
          builder: (pressed) => _keyBody(
            _label(k.label, size: 13),
            pressed: pressed,
            color: _kSpecial,
            border: _kKeyBorder,
          ),
        );
      case _Kind.caps:
        return _CapPointer(
          onDown: () => _sendKey(k),
          onUp: (_) {},
          builder: (pressed) => _keyBody(
            Icon(k.icon, size: 20, color: _caps ? _kAccent : Colors.white),
            pressed: pressed,
            color: _caps ? _kAccentDark : _kSpecial,
            border: _caps ? _kAccent : _kKeyBorder,
          ),
        );
      case _Kind.space:
        return _CapPointer(
          onDown: () => _sendKey(k),
          onUp: (_) {},
          onRepeat: () => _sendKey(k),
          builder: (pressed) => _keyBody(
            const SizedBox.shrink(),
            pressed: pressed,
          ),
        );
      case _Kind.special:
        return _CapPointer(
          onDown: () => _sendKey(k),
          onUp: (_) {},
          onRepeat: k.repeat ? () => _sendKey(k) : null,
          builder: (pressed) => _keyBody(
            k.icon != null
                ? Icon(k.icon, size: 20, color: Colors.white)
                : _label(k.label, size: 13),
            pressed: pressed,
            color: _kSpecial,
            border: _kKeyBorder,
          ),
        );
      case _Kind.char:
        final isLetter = RegExp(r'^[a-z]$').hasMatch(k.send);
        final upper = isLetter && (_shiftOn != _caps);
        final shown = isLetter
            ? (upper ? k.label.toUpperCase() : k.label)
            : (_shiftOn && k.shiftLabel != null ? k.shiftLabel! : k.label);
        return _CapPointer(
          onDown: () => _sendKey(k),
          onUp: (_) {},
          onRepeat: k.repeat ? () => _sendKey(k) : null,
          builder: (pressed) => _keyBody(
            _label(shown, size: 18),
            pressed: pressed,
          ),
        );
    }
  }

  List<Widget> _buildShortcutRows(double keyH, double gap) {
    return [
      for (final row in _shortcuts)
        Padding(
          padding: EdgeInsets.only(top: gap),
          child: SizedBox(
            height: keyH,
            child: Row(
              children: [
                for (var i = 0; i < row.length; i++)
                  Expanded(
                    child: Padding(
                      padding:
                          EdgeInsets.only(right: i == row.length - 1 ? 0 : gap),
                      child: _CapPointer(
                        onDown: () => _runShortcut(row[i]),
                        onUp: (_) {},
                        builder: (pressed) => _keyBody(
                          Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Flexible(
                                child: _label(translate(row[i].title), size: 12),
                              ),
                              if (row[i].combo.isNotEmpty)
                                Flexible(
                                  child: _label(
                                    _comboLabel(row[i]),
                                    size: 10,
                                    color: Colors.white54,
                                  ),
                                ),
                            ],
                          ),
                          pressed: pressed,
                          color: _kSpecial,
                          border: _kKeyBorder,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
    ];
  }

  String _comboLabel(_Shortcut s) {
    if (!widget.isMac) return s.combo;
    return s.combo.replaceFirst('Ctrl+', 'Cmd+').replaceFirst('Win+', 'Cmd+');
  }
}
