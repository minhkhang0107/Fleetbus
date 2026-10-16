class TourOffer {
  final String id;
  final String title;
  final String price;
  final String startDate;
  final String expiryDate;
  final bool isActive;
  final String content;

  const TourOffer({
    required this.id,
    required this.title,
    required this.price,
    required this.startDate,
    required this.expiryDate,
    required this.isActive,
    required this.content,
  });

  TourOffer copyWith({
    String? id,
    String? title,
    String? price,
    String? startDate,
    String? expiryDate,
    bool? isActive,
    String? content,
  }) {
    return TourOffer(
      id: id ?? this.id,
      title: title ?? this.title,
      price: price ?? this.price,
      startDate: startDate ?? this.startDate,
      expiryDate: expiryDate ?? this.expiryDate,
      isActive: isActive ?? this.isActive,
      content: content ?? this.content,
    );
  }
}
