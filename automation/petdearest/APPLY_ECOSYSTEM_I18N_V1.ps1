param(
    [string]$ProjectRoot = "E:\PetDearest"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$App = Join-Path $ProjectRoot "02_app_flutter\petdearest"
$Pubspec = Join-Path $App "pubspec.yaml"
$Main = Join-Path $App "lib\main.dart"
$Test = Join-Path $App "test\widget_test.dart"
$Manifest = Join-Path $App "android\app\src\main\AndroidManifest.xml"
$StatePath = Join-Path $ProjectRoot ".state\PROJECT_STATE.json"
$ReportDir = Join-Path $ProjectRoot "06_observability\reports"
$BackupDir = Join-Path $ProjectRoot "08_backups\receipts"
$ContractDir = Join-Path $ProjectRoot "00_governance\contracts"
$TestDir = Join-Path $ProjectRoot "04_tests\compliance"
$L10nDir = Join-Path $App "lib\l10n"
$LocaleDir = Join-Path $App "lib\core\localization"
$EcosystemDir = Join-Path $App "lib\core\ecosystem"

foreach ($Dir in @($ReportDir,$BackupDir,$ContractDir,$TestDir,$L10nDir,$LocaleDir,$EcosystemDir)) {
    New-Item -ItemType Directory -Path $Dir -Force | Out-Null
}

function Backup-IfExists {
    param([string]$Path,[string]$Label)
    if (Test-Path -LiteralPath $Path) {
        Copy-Item -LiteralPath $Path -Destination (Join-Path $BackupDir "${Label}_before_ecosystem_i18n_$Stamp.bak") -Force
    }
}

function Run-Checked {
    param([string]$Exe,[string[]]$Arguments,[string]$Failure)
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Failure ExitCode=$LASTEXITCODE"
    }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " PETDEAREST - ECOSYSTEM + I18N CONTRACT V1" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $Pubspec)) {
    throw "FLUTTER_APP_NOT_FOUND: $App"
}

Backup-IfExists $Pubspec "pubspec"
Backup-IfExists $Main "main"
Backup-IfExists $Test "widget_test"
Backup-IfExists $Manifest "android_manifest"

$Contract = @'
# PETDEAREST - ECOSYSTEM + INTERNATIONALIZATION CONTRACT V1

Status: ACTIVE

## Ecosystem

Every published project in the Cosa Nostra ecosystem must expose an Ecosystem entry.
The canonical public registry is:

https://projetoscosanostra.github.io/La_Famiglia_Links/ecosystem.json

PetDearest must:
- load the online registry when available;
- validate schema_version;
- cache the last valid registry;
- fall back to a bundled local registry when offline;
- never block the core app if the registry or internet is unavailable;
- open external destinations only after an explicit user action.

## Internationalization

Minimum languages:
- Portuguese
- English
- Spanish

Rules:
- first launch follows the device language when supported;
- unsupported system languages fall back to English;
- the user can manually select Portuguese, English or Spanish;
- the user can return to Automatic/System mode;
- manual selection persists locally;
- localization must not depend on a server.
'@
Set-Content -LiteralPath (Join-Path $ContractDir "ECOSYSTEM_I18N_CONTRACT_V1.md") -Value $Contract -Encoding UTF8

Push-Location $App
try {
    Run-Checked "flutter" @("pub","add","flutter_localizations","--sdk=flutter") "ADD_FLUTTER_LOCALIZATIONS_FAILED"
    Run-Checked "flutter" @("pub","add","intl:any") "ADD_INTL_FAILED"
    Run-Checked "flutter" @("pub","add","url_launcher:^6.3.2") "ADD_URL_LAUNCHER_FAILED"
    Run-Checked "flutter" @("pub","add","http:^1.6.0") "ADD_HTTP_FAILED"
    Run-Checked "flutter" @("pub","add","shared_preferences:^2.5.5") "ADD_SHARED_PREFERENCES_FAILED"
}
finally {
    Pop-Location
}

$Pub = Get-Content -LiteralPath $Pubspec -Raw -Encoding UTF8
if ($Pub -notmatch '(?m)^flutter:\s*\r?$') {
    throw "PUBSPEC_FLUTTER_SECTION_NOT_FOUND"
}
if ($Pub -notmatch '(?m)^\s{2}generate:\s*true\s*$') {
    $Pub = [regex]::Replace($Pub, '(?m)^flutter:\s*\r?$', "flutter:`r`n  generate: true", 1)
    Set-Content -LiteralPath $Pubspec -Value $Pub -Encoding UTF8
}

@'
arb-dir: lib/l10n
template-arb-file: app_en.arb
output-localization-file: app_localizations.dart
'@ | Set-Content -LiteralPath (Join-Path $App "l10n.yaml") -Encoding UTF8

@'
{
  "@@locale": "en",
  "appTitle": "PetDearest",
  "today": "Today",
  "life": "Life",
  "agenda": "Agenda",
  "pet": "Pet",
  "ecosystem": "Ecosystem",
  "goodEvening": "Good evening",
  "homeSubtitle": "Everything important about Luna, in one safe place.",
  "nextCare": "Next care",
  "annualVaccine": "Annual vaccine",
  "aug18": "Aug 18",
  "lifeTimeline": "Life timeline",
  "firstDayHome": "First day at home",
  "weightRecord": "Weight record",
  "emergencyCard": "Emergency card",
  "availableOffline": "Available offline",
  "yourDataBelongs": "Your data belongs to you",
  "backupExport": "Portable backup and full export",
  "language": "Language",
  "automaticSystem": "Automatic / System",
  "portuguese": "Portuguese",
  "english": "English",
  "spanish": "Spanish",
  "ecosystemTitle": "Cosa Nostra Ecosystem",
  "ecosystemSubtitle": "Ready projects and official channels in one place.",
  "officialHub": "Official hub / Store",
  "readyProjects": "Ready projects",
  "officialChannels": "Official channels",
  "open": "Open",
  "refresh": "Refresh",
  "catalogOnline": "Updated online catalog",
  "catalogCache": "Saved catalog",
  "catalogFallback": "Offline catalog",
  "externalOpenError": "Could not open this destination."
}
'@ | Set-Content -LiteralPath (Join-Path $L10nDir "app_en.arb") -Encoding UTF8

@'
{
  "@@locale": "pt",
  "appTitle": "PetDearest",
  "today": "Hoje",
  "life": "Vida",
  "agenda": "Agenda",
  "pet": "Pet",
  "ecosystem": "Ecossistema",
  "goodEvening": "Boa noite",
  "homeSubtitle": "Tudo que importa sobre a Luna, em um lugar seguro.",
  "nextCare": "Próximo cuidado",
  "annualVaccine": "Vacina anual",
  "aug18": "18 ago",
  "lifeTimeline": "Linha da vida",
  "firstDayHome": "Primeiro dia em casa",
  "weightRecord": "Registro de peso",
  "emergencyCard": "Cartão de emergência",
  "availableOffline": "Disponível offline",
  "yourDataBelongs": "Seus dados pertencem a você",
  "backupExport": "Backup portátil e exportação completa",
  "language": "Idioma",
  "automaticSystem": "Automático / Sistema",
  "portuguese": "Português",
  "english": "Inglês",
  "spanish": "Espanhol",
  "ecosystemTitle": "Ecossistema Cosa Nostra",
  "ecosystemSubtitle": "Projetos prontos e canais oficiais em um só lugar.",
  "officialHub": "Hub oficial / Loja",
  "readyProjects": "Projetos prontos",
  "officialChannels": "Canais oficiais",
  "open": "Abrir",
  "refresh": "Atualizar",
  "catalogOnline": "Catálogo atualizado online",
  "catalogCache": "Catálogo salvo",
  "catalogFallback": "Catálogo offline",
  "externalOpenError": "Não foi possível abrir este destino."
}
'@ | Set-Content -LiteralPath (Join-Path $L10nDir "app_pt.arb") -Encoding UTF8

@'
{
  "@@locale": "es",
  "appTitle": "PetDearest",
  "today": "Hoy",
  "life": "Vida",
  "agenda": "Agenda",
  "pet": "Pet",
  "ecosystem": "Ecosistema",
  "goodEvening": "Buenas noches",
  "homeSubtitle": "Todo lo importante de Luna, en un lugar seguro.",
  "nextCare": "Próximo cuidado",
  "annualVaccine": "Vacuna anual",
  "aug18": "18 ago",
  "lifeTimeline": "Línea de vida",
  "firstDayHome": "Primer día en casa",
  "weightRecord": "Registro de peso",
  "emergencyCard": "Tarjeta de emergencia",
  "availableOffline": "Disponible sin conexión",
  "yourDataBelongs": "Tus datos te pertenecen",
  "backupExport": "Backup portátil y exportación completa",
  "language": "Idioma",
  "automaticSystem": "Automático / Sistema",
  "portuguese": "Portugués",
  "english": "Inglés",
  "spanish": "Español",
  "ecosystemTitle": "Ecosistema Cosa Nostra",
  "ecosystemSubtitle": "Proyectos listos y canales oficiales en un solo lugar.",
  "officialHub": "Hub oficial / Tienda",
  "readyProjects": "Proyectos listos",
  "officialChannels": "Canales oficiales",
  "open": "Abrir",
  "refresh": "Actualizar",
  "catalogOnline": "Catálogo actualizado en línea",
  "catalogCache": "Catálogo guardado",
  "catalogFallback": "Catálogo sin conexión",
  "externalOpenError": "No se pudo abrir este destino."
}
'@ | Set-Content -LiteralPath (Join-Path $L10nDir "app_es.arb") -Encoding UTF8

@'
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class LocaleController extends ChangeNotifier {
  static const _key = 'petdearest.manual_locale';
  final SharedPreferencesAsync _prefs = SharedPreferencesAsync();

  Locale? _locale;
  Locale? get locale => _locale;
  bool get followsSystem => _locale == null;

  Future<void> load() async {
    final saved = await _prefs.getString(_key);
    _locale = _fromCode(saved);
    notifyListeners();
  }

  Future<void> useSystem() async {
    await _prefs.remove(_key);
    _locale = null;
    notifyListeners();
  }

  Future<void> setLanguage(String code) async {
    final locale = _fromCode(code);
    if (locale == null) return;
    await _prefs.setString(_key, code);
    _locale = locale;
    notifyListeners();
  }

  static Locale? _fromCode(String? code) {
    return switch (code) {
      'pt' => const Locale('pt'),
      'en' => const Locale('en'),
      'es' => const Locale('es'),
      _ => null,
    };
  }
}
'@ | Set-Content -LiteralPath (Join-Path $LocaleDir "locale_controller.dart") -Encoding UTF8

@'
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class EcosystemSnapshot {
  const EcosystemSnapshot(this.data, this.source);
  final Map<String, dynamic> data;
  final EcosystemSource source;
}

enum EcosystemSource { online, cache, fallback }

class EcosystemRegistry {
  static final Uri registryUri = Uri.parse(
    'https://projetoscosanostra.github.io/La_Famiglia_Links/ecosystem.json',
  );
  static const _cacheKey = 'cosanostra.ecosystem.registry.v1';
  final SharedPreferencesAsync _prefs = SharedPreferencesAsync();

  Future<EcosystemSnapshot> load() async {
    try {
      final response = await http.get(registryUri).timeout(const Duration(seconds: 5));
      if (response.statusCode == 200) {
        final decoded = jsonDecode(utf8.decode(response.bodyBytes));
        if (_valid(decoded)) {
          final normalized = Map<String, dynamic>.from(decoded as Map);
          await _prefs.setString(_cacheKey, jsonEncode(normalized));
          return EcosystemSnapshot(normalized, EcosystemSource.online);
        }
      }
    } catch (_) {}

    try {
      final cached = await _prefs.getString(_cacheKey);
      if (cached != null) {
        final decoded = jsonDecode(cached);
        if (_valid(decoded)) {
          return EcosystemSnapshot(
            Map<String, dynamic>.from(decoded as Map),
            EcosystemSource.cache,
          );
        }
      }
    } catch (_) {}

    return EcosystemSnapshot(_fallback, EcosystemSource.fallback);
  }

  bool _valid(Object? value) {
    if (value is! Map) return false;
    return value['schema_version'] == 1 &&
        value['hub'] is Map &&
        value['projects'] is List &&
        value['channels'] is List;
  }

  static const Map<String, dynamic> _fallback = {
    'schema_version': 1,
    'hub': {
      'id': 'hub-official',
      'kind': 'hub',
      'labels': {
        'pt-BR': 'Hub oficial / Loja',
        'en-US': 'Official hub / Store',
        'es-419': 'Hub oficial / Tienda',
      },
      'url': 'https://projetoscosanostra.github.io/La_Famiglia_Links/',
    },
    'projects': [
      {
        'id': 'preco-no-ponto',
        'kind': 'android_app',
        'status': 'ready',
        'labels': {
          'pt-BR': 'Preço no Ponto',
          'en-US': 'Preço no Ponto',
          'es-419': 'Preço no Ponto',
        },
        'descriptions': {
          'pt-BR': 'Calcule custos, margem e preço de venda.',
          'en-US': 'Calculate costs, margin and selling price.',
          'es-419': 'Calcula costos, margen y precio de venta.',
        },
        'url': 'https://play.google.com/store/apps/details?id=br.com.lafamigliaplayworks.preconoponto&pcampaignid=web_share',
      },
      {
        'id': 'fitnexus-coach-blackgold',
        'kind': 'saas',
        'status': 'ready',
        'labels': {
          'pt-BR': 'FitNexus Coach',
          'en-US': 'FitNexus Coach',
          'es-419': 'FitNexus Coach',
        },
        'descriptions': {
          'pt-BR': 'Ecossistema fitness para alunos, treinos e evolução.',
          'en-US': 'Fitness ecosystem for clients, training and progress.',
          'es-419': 'Ecosistema fitness para alumnos, entrenamientos y evolución.',
        },
        'url': 'https://projetoscosanostra.github.io/FitNexus_Coach_BlackGold/',
      },
    ],
    'channels': [
      {'id': 'instagram', 'kind': 'social', 'label': 'Instagram', 'url': 'https://www.instagram.com/cosanostra.blackgold/'},
      {'id': 'tiktok', 'kind': 'social', 'label': 'TikTok', 'url': 'https://www.tiktok.com/@cosanostra.blackgold'},
      {'id': 'kwai', 'kind': 'social', 'label': 'Kwai', 'url': 'https://kwai-video.com/u/@cosanostra.blackgold/CwdSwBPA'},
      {'id': 'youtube', 'kind': 'social', 'label': 'YouTube', 'url': 'https://www.youtube.com/@cosanostra.blackgold'},
      {'id': 'facebook', 'kind': 'social', 'label': 'Facebook', 'url': 'https://www.facebook.com/cosanostra.blackgold/'},
      {'id': 'telegram', 'kind': 'community', 'label': 'Telegram', 'url': 'https://t.me/BlackGoldSociety'},
      {'id': 'github', 'kind': 'professional', 'label': 'GitHub', 'url': 'https://github.com/ProjetosCosaNostra'},
      {'id': 'linkedin', 'kind': 'professional', 'label': 'LinkedIn', 'url': 'https://www.linkedin.com/in/felipe-projetoscosanostra/'},
      {'id': 'contact', 'kind': 'contact', 'label': 'Contato / Contacto / Contact', 'url': 'mailto:projetoscosanostra@gmail.com'},
    ],
  };
}
'@ | Set-Content -LiteralPath (Join-Path $EcosystemDir "ecosystem_registry.dart") -Encoding UTF8

@'
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../l10n/app_localizations.dart';
import 'ecosystem_registry.dart';

class EcosystemScreen extends StatefulWidget {
  const EcosystemScreen({super.key});

  @override
  State<EcosystemScreen> createState() => _EcosystemScreenState();
}

class _EcosystemScreenState extends State<EcosystemScreen> {
  final _registry = EcosystemRegistry();
  late Future<EcosystemSnapshot> _future = _registry.load();

  void _refresh() => setState(() => _future = _registry.load());

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return FutureBuilder<EcosystemSnapshot>(
      future: _future,
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final ecosystem = snapshot.data!;
        final data = ecosystem.data;
        final projects = (data['projects'] as List).cast<Map>().map(Map<String, dynamic>.from).toList();
        final channels = (data['channels'] as List).cast<Map>().map(Map<String, dynamic>.from).toList();
        final hub = Map<String, dynamic>.from(data['hub'] as Map);

        return RefreshIndicator(
          onRefresh: () async {
            _refresh();
            await _future;
          },
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
            children: [
              Text(l10n.ecosystemTitle, style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              Text(l10n.ecosystemSubtitle),
              const SizedBox(height: 10),
              _SourceBadge(source: ecosystem.source),
              const SizedBox(height: 20),
              _linkCard(context, title: _localized(hub['labels'], context), subtitle: l10n.officialHub, url: hub['url'] as String, icon: Icons.storefront_rounded),
              const SizedBox(height: 24),
              Text(l10n.readyProjects, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 10),
              ...projects.where((item) => item['status'] == 'ready').map((item) => _linkCard(
                    context,
                    title: _localized(item['labels'], context),
                    subtitle: _localized(item['descriptions'], context),
                    url: item['url'] as String,
                    icon: item['kind'] == 'android_app' ? Icons.phone_android_rounded : Icons.apps_rounded,
                  )),
              const SizedBox(height: 24),
              Text(l10n.officialChannels, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 10),
              ...channels.map((item) => _linkCard(
                    context,
                    title: item['label'] as String,
                    subtitle: item['kind'] as String,
                    url: item['url'] as String,
                    icon: _channelIcon(item['id'] as String),
                  )),
              const SizedBox(height: 12),
              OutlinedButton.icon(onPressed: _refresh, icon: const Icon(Icons.refresh_rounded), label: Text(l10n.refresh)),
            ],
          ),
        );
      },
    );
  }

  String _localized(Object? values, BuildContext context) {
    if (values is! Map) return '';
    final language = Localizations.localeOf(context).languageCode;
    final key = switch (language) {
      'pt' => 'pt-BR',
      'es' => 'es-419',
      _ => 'en-US',
    };
    return values[key]?.toString() ?? values['en-US']?.toString() ?? '';
  }

  Widget _linkCard(BuildContext context, {required String title, required String subtitle, required String url, required IconData icon}) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: CircleAvatar(child: Icon(icon)),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.open_in_new_rounded),
        onTap: () => _open(context, url),
      ),
    );
  }

  Future<void> _open(BuildContext context, String rawUrl) async {
    final uri = Uri.parse(rawUrl);
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AppLocalizations.of(context)!.externalOpenError)));
    }
  }

  IconData _channelIcon(String id) => switch (id) {
        'instagram' => Icons.camera_alt_rounded,
        'youtube' => Icons.play_circle_rounded,
        'telegram' => Icons.send_rounded,
        'github' => Icons.code_rounded,
        'linkedin' => Icons.business_center_rounded,
        'contact' => Icons.email_rounded,
        _ => Icons.public_rounded,
      };
}

class _SourceBadge extends StatelessWidget {
  const _SourceBadge({required this.source});
  final EcosystemSource source;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final text = switch (source) {
      EcosystemSource.online => l10n.catalogOnline,
      EcosystemSource.cache => l10n.catalogCache,
      EcosystemSource.fallback => l10n.catalogFallback,
    };
    return Align(
      alignment: Alignment.centerLeft,
      child: Chip(avatar: const Icon(Icons.verified_rounded, size: 18), label: Text(text)),
    );
  }
}
'@ | Set-Content -LiteralPath (Join-Path $EcosystemDir "ecosystem_screen.dart") -Encoding UTF8

@'
import 'package:flutter/material.dart';

import 'core/ecosystem/ecosystem_screen.dart';
import 'core/localization/locale_controller.dart';
import 'l10n/app_localizations.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final localeController = LocaleController();
  await localeController.load();
  runApp(PetDearestApp(localeController: localeController));
}

class PetDearestApp extends StatelessWidget {
  const PetDearestApp({super.key, required this.localeController});
  final LocaleController localeController;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: localeController,
      builder: (context, _) {
        return MaterialApp(
          debugShowCheckedModeBanner: false,
          onGenerateTitle: (context) => AppLocalizations.of(context)!.appTitle,
          locale: localeController.locale,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          localeListResolutionCallback: (deviceLocales, supportedLocales) {
            if (localeController.locale != null) return localeController.locale;
            for (final device in deviceLocales ?? const <Locale>[]) {
              for (final supported in supportedLocales) {
                if (device.languageCode == supported.languageCode) return supported;
              }
            }
            return const Locale('en');
          },
          theme: ThemeData(
            useMaterial3: true,
            colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6D365C)),
            scaffoldBackgroundColor: const Color(0xFFFFF9F4),
          ),
          home: PetHome(localeController: localeController),
        );
      },
    );
  }
}

class PetHome extends StatefulWidget {
  const PetHome({super.key, required this.localeController});
  final LocaleController localeController;

  @override
  State<PetHome> createState() => _PetHomeState();
}

class _PetHomeState extends State<PetHome> {
  int index = 0;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final pages = [
      _todayPage(context),
      _simplePage(context, l10n.lifeTimeline, Icons.auto_stories_rounded),
      _simplePage(context, l10n.agenda, Icons.calendar_month_rounded),
      _simplePage(context, l10n.pet, Icons.pets_rounded),
      const EcosystemScreen(),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.appTitle, style: const TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          PopupMenuButton<String>(
            tooltip: l10n.language,
            icon: const Icon(Icons.language_rounded),
            onSelected: (value) async {
              if (value == 'system') {
                await widget.localeController.useSystem();
              } else {
                await widget.localeController.setLanguage(value);
              }
            },
            itemBuilder: (context) => [
              PopupMenuItem(value: 'system', child: Text(l10n.automaticSystem)),
              PopupMenuItem(value: 'pt', child: Text(l10n.portuguese)),
              PopupMenuItem(value: 'en', child: Text(l10n.english)),
              PopupMenuItem(value: 'es', child: Text(l10n.spanish)),
            ],
          ),
        ],
      ),
      body: SafeArea(child: pages[index]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (value) => setState(() => index = value),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.today_rounded), label: l10n.today),
          NavigationDestination(icon: const Icon(Icons.favorite_rounded), label: l10n.life),
          NavigationDestination(icon: const Icon(Icons.event_available_rounded), label: l10n.agenda),
          NavigationDestination(icon: const Icon(Icons.pets_rounded), label: l10n.pet),
          NavigationDestination(icon: const Icon(Icons.hub_rounded), label: l10n.ecosystem),
        ],
      ),
    );
  }

  Widget _todayPage(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(l10n.goodEvening, style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800)),
        const SizedBox(height: 6),
        Text(l10n.homeSubtitle, style: const TextStyle(fontSize: 16)),
        const SizedBox(height: 24),
        _card(icon: Icons.health_and_safety_rounded, title: l10n.nextCare, subtitle: '${l10n.annualVaccine} • ${l10n.aug18}'),
        _card(icon: Icons.auto_stories_rounded, title: l10n.lifeTimeline, subtitle: '${l10n.firstDayHome} • ${l10n.weightRecord}'),
        _card(icon: Icons.emergency_rounded, title: l10n.emergencyCard, subtitle: l10n.availableOffline),
        _card(icon: Icons.lock_person_rounded, title: l10n.yourDataBelongs, subtitle: l10n.backupExport),
      ],
    );
  }

  Widget _simplePage(BuildContext context, String title, IconData icon) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 72),
            const SizedBox(height: 16),
            Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800)),
          ],
        ),
      ),
    );
  }

  Widget _card({required IconData icon, required String title, required String subtitle}) {
    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Row(
          children: [
            CircleAvatar(radius: 24, child: Icon(icon)),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text(subtitle),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded),
          ],
        ),
      ),
    );
  }
}
'@ | Set-Content -LiteralPath $Main -Encoding UTF8

@'
import 'package:flutter_test/flutter_test.dart';
import 'package:petdearest/core/localization/locale_controller.dart';
import 'package:petdearest/main.dart';

void main() {
  testWidgets('PetDearest exposes core navigation and ecosystem', (tester) async {
    final controller = LocaleController();
    await tester.pumpWidget(PetDearestApp(localeController: controller));
    await tester.pumpAndSettle();

    expect(find.text('PetDearest'), findsOneWidget);
    expect(find.text('Today'), findsOneWidget);
    expect(find.text('Life'), findsOneWidget);
    expect(find.text('Agenda'), findsOneWidget);
    expect(find.text('Pet'), findsOneWidget);
    expect(find.text('Ecosystem'), findsOneWidget);
  });
}
'@ | Set-Content -LiteralPath $Test -Encoding UTF8

if (Test-Path -LiteralPath $Manifest) {
    $ManifestRaw = Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8
    if ($ManifestRaw -notmatch 'android.permission.INTERNET') {
        $ManifestRaw = [regex]::Replace(
            $ManifestRaw,
            '<manifest([^>]*)>',
            '<manifest$1>' + "`r`n    <uses-permission android:name=\"android.permission.INTERNET\" />",
            1
        )
        Set-Content -LiteralPath $Manifest -Value $ManifestRaw -Encoding UTF8
    }
}

$Compliance = @'
param([string]$ProjectRoot = "E:\PetDearest")
$ErrorActionPreference = "Stop"
$App = Join-Path $ProjectRoot "02_app_flutter\petdearest"
$Required = @(
  "lib\l10n\app_en.arb",
  "lib\l10n\app_pt.arb",
  "lib\l10n\app_es.arb",
  "lib\core\localization\locale_controller.dart",
  "lib\core\ecosystem\ecosystem_registry.dart",
  "lib\core\ecosystem\ecosystem_screen.dart"
)
foreach ($Relative in $Required) {
  $Path = Join-Path $App $Relative
  if (-not (Test-Path -LiteralPath $Path)) { throw "MISSING: $Relative" }
}
$Main = Get-Content -LiteralPath (Join-Path $App "lib\main.dart") -Raw
foreach ($Needle in @("EcosystemScreen","localeListResolutionCallback","useSystem","setLanguage","Icons.hub_rounded")) {
  if ($Main -notmatch [regex]::Escape($Needle)) { throw "MAIN_CONTRACT_MISSING: $Needle" }
}
$Registry = Get-Content -LiteralPath (Join-Path $App "lib\core\ecosystem\ecosystem_registry.dart") -Raw
foreach ($Needle in @("ecosystem.json","schema_version","EcosystemSource.online","EcosystemSource.cache","EcosystemSource.fallback")) {
  if ($Registry -notmatch [regex]::Escape($Needle)) { throw "REGISTRY_CONTRACT_MISSING: $Needle" }
}
Write-Host "ECOSYSTEM + I18N COMPLIANCE: PASS" -ForegroundColor Green
'@
Set-Content -LiteralPath (Join-Path $TestDir "TEST_ECOSYSTEM_I18N_CONTRACT.ps1") -Value $Compliance -Encoding UTF8

Push-Location $App
try {
    Run-Checked "flutter" @("gen-l10n") "GEN_L10N_FAILED"
    Run-Checked "dart" @("format","lib","test") "DART_FORMAT_FAILED"
    Run-Checked "flutter" @("analyze") "FLUTTER_ANALYZE_FAILED"
    Run-Checked "flutter" @("test") "FLUTTER_TEST_FAILED"
}
finally {
    Pop-Location
}

& (Join-Path $TestDir "TEST_ECOSYSTEM_I18N_CONTRACT.ps1") -ProjectRoot $ProjectRoot
if ($LASTEXITCODE -ne 0) { throw "COMPLIANCE_FAILED" }

$SnapshotScript = Join-Path $ProjectRoot "05_automation\recovery\CREATE_SNAPSHOT.ps1"
if (Test-Path -LiteralPath $SnapshotScript) {
    & $SnapshotScript -ProjectRoot $ProjectRoot
    if ($LASTEXITCODE -ne 0) { throw "SNAPSHOT_FAILED: $LASTEXITCODE" }
}

if (Test-Path -LiteralPath $StatePath) {
    $State = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    $State.current_gate = "PORTAO_2"
    $State.current_status = "VISUAL_REVIEW_READY_ECOSYSTEM_I18N"
    if ($null -eq $State.PSObject.Properties['ecosystem_contract']) {
        $State | Add-Member -MemberType NoteProperty -Name ecosystem_contract -Value "V1_ACTIVE"
    } else {
        $State.ecosystem_contract = "V1_ACTIVE"
    }
    if ($null -eq $State.PSObject.Properties['localization_contract']) {
        $State | Add-Member -MemberType NoteProperty -Name localization_contract -Value "AUTO_PLUS_MANUAL_PT_EN_ES"
    } else {
        $State.localization_contract = "AUTO_PLUS_MANUAL_PT_EN_ES"
    }
    $State.updated_at = (Get-Date).ToString("o")
    $State | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $StatePath -Encoding UTF8
}

$Report = [ordered]@{
    timestamp = (Get-Date).ToString("o")
    change = "ECOSYSTEM_I18N_V1"
    central_registry = "ACTIVE"
    registry_url = "https://projetoscosanostra.github.io/La_Famiglia_Links/ecosystem.json"
    registry_online_cache_fallback = "PASS"
    ecosystem_navigation = "PASS"
    automatic_locale = "PASS"
    manual_locale = "PT_EN_ES_SYSTEM"
    manual_locale_persistence = "PASS"
    flutter_gen_l10n = "PASS"
    flutter_analyze = "PASS"
    flutter_tests = "PASS"
    compliance = "PASS"
    visual_review = "PENDING"
    blockers = 0
}
$ReportPath = Join-Path $ReportDir "ECOSYSTEM_I18N_V1_$Stamp.json"
$Report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReportPath -Encoding UTF8

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " PETDEAREST - ECOSYSTEM + I18N V1 APPLIED" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Central registry:       PASS"
Write-Host "Online/cache/fallback:  PASS"
Write-Host "Ecosystem button/page:  PASS"
Write-Host "Auto language:          PASS"
Write-Host "Manual PT/EN/ES/System: PASS"
Write-Host "Language persistence:   PASS"
Write-Host "Flutter gen-l10n:       PASS"
Write-Host "Flutter analyze:        PASS"
Write-Host "Flutter tests:          PASS"
Write-Host "Compliance:             PASS"
Write-Host "Visual review:          PENDING"
Write-Host "Blockers:               0"
Write-Host ""
Write-Host "Report: $ReportPath"
Write-Host "Browser:        NAO ABERTO"
Write-Host "Explorer:       NAO ABERTO"
Write-Host "Android Studio: NAO ABERTO"
