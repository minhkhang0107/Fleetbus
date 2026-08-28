import 'package:flutter/material.dart';
import 'package:domain/domain.dart';
import 'package:data/data.dart';
import 'package:resources/resources.dart';

class KnowledgeBaseScreen extends StatefulWidget {
  final KnowledgeRepository? repository;

  const KnowledgeBaseScreen({super.key, this.repository});

  @override
  State<KnowledgeBaseScreen> createState() => _KnowledgeBaseScreenState();
}

class _KnowledgeBaseScreenState extends State<KnowledgeBaseScreen> {
  late final KnowledgeRepository _repository;
  bool _isLoading = true;

  final _agentNameController = TextEditingController();
  final _jobTitleController = TextEditingController();
  final _toneOfVoiceController = TextEditingController();

  List<TourOffer> _tours = [];
  final Map<String, bool> _expandedMap = {};

  @override
  void initState() {
    super.initState();
    _repository = widget.repository ?? KnowledgeRepositoryImpl();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final persona = await _repository.getPersonaConfig();
    final tours = await _repository.getTours();

    _agentNameController.text = persona.agentName;
    _jobTitleController.text = persona.jobTitle;
    _toneOfVoiceController.text = persona.toneOfVoice;

    setState(() {
      _tours = List.from(tours);
      if (_tours.isNotEmpty) {
        _expandedMap[_tours.first.id] = true;
      }
      _isLoading = false;
    });
  }

  Future<void> _savePersona() async {
    final updatedPersona = PersonaConfig(
      agentName: _agentNameController.text.trim(),
      jobTitle: _jobTitleController.text.trim(),
      toneOfVoice: _toneOfVoiceController.text.trim(),
    );
    await _repository.savePersonaConfig(updatedPersona);

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Đã lưu cấu hình Persona Roleplay thành công!'),
          backgroundColor: AppColors.safeEmerald,
        ),
      );
    }
  }

  Future<void> _saveTour(TourOffer tour) async {
    await _repository.saveTour(tour);
    await _loadData();

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Đã cập nhật tour: "${tour.title}"'),
          backgroundColor: AppColors.sapphireAccent,
        ),
      );
    }
  }

  Future<void> _deleteTour(String id) async {
    await _repository.deleteTour(id);
    await _loadData();

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Đã xóa tour khỏi hệ thống!'),
          backgroundColor: AppColors.alertCrimson,
        ),
      );
    }
  }

  void _showAddTourDialog() {
    final titleCtrl = TextEditingController();
    final priceCtrl = TextEditingController();
    final startCtrl = TextEditingController(text: '2026-09-01');
    final expiryCtrl = TextEditingController(text: '2026-10-30');
    final contentCtrl = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Row(
            children: [
              Icon(Icons.add_location_alt_rounded, color: AppColors.sapphireAccent),
              SizedBox(width: 8),
              Text('Thêm Tour / Ưu Đãi Mới', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            ],
          ),
          content: SizedBox(
            width: 500,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: titleCtrl,
                    decoration: const InputDecoration(labelText: 'Tên Tour / Chương trình ưu đãi'),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: priceCtrl,
                          decoration: const InputDecoration(labelText: 'Giá hiển thị (VNĐ)'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: TextField(
                          controller: startCtrl,
                          decoration: const InputDecoration(labelText: 'Ngày bắt đầu'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: TextField(
                          controller: expiryCtrl,
                          decoration: const InputDecoration(labelText: 'Ngày hết hạn'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: contentCtrl,
                    maxLines: 3,
                    decoration: const InputDecoration(labelText: 'Chi tiết lịch trình / dịch vụ bao gồm'),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Hủy', style: TextStyle(color: AppColors.mutedSteel)),
            ),
            ElevatedButton.icon(
              onPressed: () async {
                if (titleCtrl.text.trim().isEmpty) return;
                final newTour = TourOffer(
                  id: 'tour_${DateTime.now().millisecondsSinceEpoch}',
                  title: titleCtrl.text.trim(),
                  price: priceCtrl.text.trim(),
                  startDate: startCtrl.text.trim(),
                  expiryDate: expiryCtrl.text.trim(),
                  isActive: true,
                  content: contentCtrl.text.trim(),
                );
                await _saveTour(newTour);
                if (ctx.mounted) Navigator.pop(ctx);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.sapphireAccent,
                foregroundColor: Colors.white,
              ),
              icon: const Icon(Icons.check_rounded, size: 18),
              label: const Text('Tạo Tour'),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        backgroundColor: AppColors.canvasWhite,
        body: Center(
          child: CircularProgressIndicator(color: AppColors.sapphireAccent),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.canvasWhite,
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAlignment.start,
          children: [
            const Text(
              'Knowledge Base & Persona Management',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: AppColors.charcoalInk,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Quản lý thông tin Persona đóng vai cho AI và kho dữ liệu Tour/Ưu đãi du lịch.',
              style: TextStyle(fontSize: 13, color: AppColors.mutedSteel),
            ),
            const SizedBox(height: 24),

            // Section 1: Persona Configuration Form
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: const BorderSide(color: AppColors.whisperBorder),
              ),
              child: Padding(
                padding: const EdgeInsets.all(20.0),
                child: Column(
                  crossAxisAlignment: CrossAlignment.start,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.psychology_rounded, color: AppColors.sapphireAccent),
                        SizedBox(width: 8),
                        Text(
                          'Persona Roleplay Configuration',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: AppColors.charcoalInk,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _agentNameController,
                            decoration: const InputDecoration(
                              labelText: 'Agent Name (Tên hiển thị)',
                            ),
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: TextField(
                            controller: _jobTitleController,
                            decoration: const InputDecoration(
                              labelText: 'Job Title / Experience',
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _toneOfVoiceController,
                      maxLines: 2,
                      decoration: const InputDecoration(
                        labelText: 'Tone of Voice (Giọng điệu tư vấn)',
                      ),
                    ),
                    const SizedBox(height: 16),
                    Align(
                      alignment: Alignment.centerRight,
                      child: ElevatedButton.icon(
                        onPressed: _savePersona,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.sapphireAccent,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        icon: const Icon(Icons.save_rounded, size: 18),
                        label: const Text('Save Persona'),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 32),

            // Section 2: Tours & Promotions Database (Accordion List)
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Tours & Promotions Database',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppColors.charcoalInk,
                  ),
                ),
                ElevatedButton.icon(
                  onPressed: _showAddTourDialog,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.pureSurface,
                    foregroundColor: AppColors.sapphireAccent,
                    side: const BorderSide(color: AppColors.whisperBorder),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  icon: const Icon(Icons.add_rounded, size: 18),
                  label: const Text('Thêm Tour Mới'),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Accordion Rows
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _tours.length,
              itemBuilder: (context, index) {
                final tour = _tours[index];
                final isExpanded = _expandedMap[tour.id] ?? false;

                return _TourAccordionItem(
                  tour: tour,
                  isExpanded: isExpanded,
                  onToggleExpand: () {
                    setState(() {
                      _expandedMap[tour.id] = !isExpanded;
                    });
                  },
                  onSave: _saveTour,
                  onDelete: () => _deleteTour(tour.id),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _TourAccordionItem extends StatefulWidget {
  final TourOffer tour;
  final bool isExpanded;
  final VoidCallback onToggleExpand;
  final ValueChanged<TourOffer> onSave;
  final VoidCallback onDelete;

  const _TourAccordionItem({
    required this.tour,
    required this.isExpanded,
    required this.onToggleExpand,
    required this.onSave,
    required this.onDelete,
  });

  @override
  State<_TourAccordionItem> createState() => _TourAccordionItemState();
}

class _TourAccordionItemState extends State<_TourAccordionItem> {
  late final TextEditingController _titleCtrl;
  late final TextEditingController _priceCtrl;
  late final TextEditingController _startCtrl;
  late final TextEditingController _expiryCtrl;
  late final TextEditingController _contentCtrl;
  late bool _isActive;

  @override
  void initState() {
    super.initState();
    _titleCtrl = TextEditingController(text: widget.tour.title);
    _priceCtrl = TextEditingController(text: widget.tour.price);
    _startCtrl = TextEditingController(text: widget.tour.startDate);
    _expiryCtrl = TextEditingController(text: widget.tour.expiryDate);
    _contentCtrl = TextEditingController(text: widget.tour.content);
    _isActive = widget.tour.isActive;
  }

  bool get _isEffectiveActive {
    final expDate = DateTime.tryParse(widget.tour.expiryDate);
    if (expDate != null && expDate.isBefore(DateTime.now())) {
      return false;
    }
    return widget.tour.isActive;
  }

  @override
  Widget build(BuildContext context) {
    final tour = widget.tour;
    final isEffective = _isEffectiveActive;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.pureSurface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.whisperBorder),
      ),
      child: Column(
        children: [
          // Header / Collapsed Row
          InkWell(
            onTap: widget.onToggleExpand,
            borderRadius: BorderRadius.circular(10),
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                children: [
                  Icon(
                    widget.isExpanded
                        ? Icons.keyboard_arrow_down_rounded
                        : Icons.keyboard_arrow_right_rounded,
                    color: AppColors.mutedSteel,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 3,
                    child: Text(
                      tour.title,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.charcoalInk,
                      ),
                    ),
                  ),
                  Expanded(
                    flex: 1,
                    child: Text(
                      tour.price,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: AppColors.sapphireAccent,
                      ),
                    ),
                  ),
                  Expanded(
                    flex: 1,
                    child: Text(
                      'Hạn: ${tour.expiryDate}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.mutedSteel,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: isEffective
                          ? AppColors.safeEmerald.withValues(alpha: 0.1)
                          : AppColors.alertCrimson.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      isEffective ? 'Active' : 'Expired',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: isEffective ? AppColors.safeEmerald : AppColors.alertCrimson,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Expanded Details & Editing Section
          if (widget.isExpanded) ...[
            const Divider(height: 1, color: AppColors.whisperBorder),
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAlignment.start,
                children: [
                  TextFormField(
                    controller: _titleCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Tên Tour / Ưu Đãi',
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _contentCtrl,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: 'Chi tiết lịch trình / Nội dung ưu đãi',
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: _priceCtrl,
                          decoration: const InputDecoration(
                            labelText: 'Giá tiền',
                          ),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: TextFormField(
                          controller: _startCtrl,
                          decoration: const InputDecoration(
                            labelText: 'Ngày bắt đầu',
                          ),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: TextFormField(
                          controller: _expiryCtrl,
                          decoration: const InputDecoration(
                            labelText: 'Ngày hết hạn',
                          ),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Row(
                        children: [
                          const Text('Kích hoạt', style: TextStyle(fontSize: 13, color: AppColors.charcoalInk)),
                          Switch(
                            value: _isActive,
                            activeColor: AppColors.safeEmerald,
                            onChanged: (val) {
                              setState(() => _isActive = val);
                            },
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      OutlinedButton.icon(
                        onPressed: widget.onDelete,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.alertCrimson,
                          side: const BorderSide(color: AppColors.alertCrimson),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        icon: const Icon(Icons.delete_outline, size: 18),
                        label: const Text('Xóa Tour'),
                      ),
                      const SizedBox(width: 12),
                      ElevatedButton.icon(
                        onPressed: () {
                          final updated = tour.copyWith(
                            title: _titleCtrl.text.trim(),
                            price: _priceCtrl.text.trim(),
                            startDate: _startCtrl.text.trim(),
                            expiryDate: _expiryCtrl.text.trim(),
                            isActive: _isActive,
                            content: _contentCtrl.text.trim(),
                          );
                          widget.onSave(updated);
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.sapphireAccent,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        icon: const Icon(Icons.check_rounded, size: 18),
                        label: const Text('Save Changes'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
