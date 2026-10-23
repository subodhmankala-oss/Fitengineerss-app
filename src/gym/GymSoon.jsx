const WHAT = {
  classes: 'Class timetable, slot bookings and who is coming to each class.',
  payments: 'Plans, who has paid, who is due, and UPI payment links.',
  leads: 'Enquiries moving from new enquiry to trial to joined.',
  reports: 'Month-by-month collections, joins and member retention.',
  settings: 'Your gym colour, automatic WhatsApp messages, and plans & prices.'
};

// A screen from the design that is built in a later stage.
export default function GymSoon({ item }) {
  return (
    <div>
      <h1 className="gx-h1">{item.label}</h1>
      <div className="gx-card gx-soon">
        <p className="gx-title">Coming in the next stage</p>
        <p className="gx-sub">{WHAT[item.key]}</p>
      </div>
    </div>
  );
}
