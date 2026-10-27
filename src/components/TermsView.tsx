/**
 * Conditions d’utilisation de Gilli (assistant d’achat, Espace vendeur et marketplace).
 * La liste des produits interdits doit rester cohérente avec le contrôle automatique des annonces
 * (server/marketplace/rules.mjs et server/marketplace/moderation.mjs).
 */
export function TermsView() {
  return (
    <div className="page-view terms-view">
      <h1>Conditions d’utilisation</h1>
      <p className="terms-updated">Dernière mise à jour : octobre 2026</p>

      <section>
        <h2>1. Objet</h2>
        <p>Gilli est un service qui propose une marketplace où les commerçants présentent leurs produits, un assistant d’achat qui aide à trouver les annonces correspondant à votre besoin et un espace de gestion pour les commerçants (Espace vendeur). Le paiement et la livraison se règlent directement entre le client et le vendeur, en dehors de Gilli. En utilisant Gilli, vous acceptez les présentes conditions.</p>
      </section>

      <section>
        <h2>2. Comptes</h2>
        <p>L’Espace vendeur et la publication d’annonces demandent un compte. Vous êtes responsable de l’usage de votre compte et des informations que vous y enregistrez. Un compte peut être suspendu en cas de non-respect des présentes conditions.</p>
      </section>

      <section>
        <h2>3. La marketplace</h2>
        <p>Gilli met en relation des acheteurs et des vendeurs. Gilli n’est ni le vendeur, ni l’acheteur, ni un intermédiaire de paiement : la vente, le paiement, la livraison et la garantie se règlent directement entre l’acheteur et le vendeur, qui en sont seuls responsables.</p>
        <p>Le vendeur s’engage à publier des informations exactes (description, état, prix, disponibilité, photos réelles du produit) et à respecter les lois en vigueur dans son pays, notamment en matière de commerce, de consommation et de fiscalité.</p>
      </section>

      <section>
        <h2>4. Produits et contenus interdits</h2>
        <p>Il est strictement interdit de proposer, rechercher ou promouvoir sur Gilli :</p>
        <ul className="terms-forbidden">
          <li>les armes, munitions, explosifs et leurs pièces (armes à feu, armes de guerre, grenades, détonateurs…) ;</li>
          <li>les drogues et stupéfiants, ainsi que le matériel destiné à leur consommation ou à leur fabrication ;</li>
          <li>les médicaments, y compris ceux vendus sans ordonnance et les produits présentés comme tels (tramadol, codéine…) ;</li>
          <li>les êtres humains, les organes, le sang et les tissus humains, ainsi que les services sexuels ;</li>
          <li>les espèces animales et végétales protégées et leurs produits (ivoire, écailles de pangolin, peaux de félins…) ;</li>
          <li>les faux documents, faux billets, moyens de paiement volés et les arnaques (multiplication d’argent, « billets noirs »…) ;</li>
          <li>les objets volés ou d’origine douteuse et les contrefaçons ;</li>
          <li>les contenus pornographiques ou à caractère sexuel ;</li>
          <li>les produits dangereux ou interdits à la vente au public (cyanure, mercure…) ;</li>
          <li>les données personnelles, comptes et accès piratés ;</li>
          <li>tout produit ou service dont la vente est interdite par la loi du pays du vendeur ou de l’acheteur.</li>
        </ul>
        <p>Les contenus trompeurs, incompréhensibles, haineux ou sans rapport avec le produit sont également interdits.</p>
      </section>

      <section>
        <h2>5. Vérification des annonces</h2>
        <p>Chaque annonce, à sa création comme à chaque modification, est vérifiée avant d’être visible : un contrôle automatique (recherche de mots liés aux produits interdits, détection de texte incompréhensible, puis examen par un agent d’intelligence artificielle) et, en cas de doute, une vérification par l’équipe Gilli.</p>
        <p>Gilli peut refuser, masquer ou retirer une annonce, et suspendre un vendeur, en cas de non-respect des présentes conditions ou de signalements fondés. Les cas graves peuvent être signalés aux autorités compétentes.</p>
      </section>

      <section>
        <h2>6. Signalements</h2>
        <p>Chacun peut signaler une annonce depuis sa page. Plusieurs signalements suspendent l’annonce en attendant la vérification par l’équipe Gilli.</p>
        <p>Avis sur les vendeurs : avec un compte, vous pouvez donner un avis (note et commentaire) sur un vendeur, un seul par vendeur, modifiable et supprimable ; un commerçant ne peut pas noter son propre commerce. Les avis sont publiés sans le nom ni l’adresse de leur auteur. Ils doivent être honnêtes et respectueux : un avis contenant des insultes, un numéro de téléphone, un lien ou un produit interdit est vérifié par l’équipe Gilli, qui peut le masquer.</p>
      </section>

      <section>
        <h2>7. Conseils aux acheteurs</h2>
        <p>Voyez le produit avant de payer, préférez un lieu public pour la remise, méfiez-vous des prix anormalement bas et ne communiquez jamais vos codes de paiement mobile.</p>
      </section>

      <section>
        <h2>8. Données personnelles</h2>
        <p>Le nom de la vitrine, la ville et les numéros de contact du vendeur sont publics, afin que les clients puissent le joindre. Les données de gestion du commerce (ventes, dépenses, stock, noms des clients) restent privées et ne sont visibles que par les membres du commerce. Les photos jointes à l’assistant ne sont pas conservées.</p>
        <p>Une fois connecté, vos conversations (assistant d’achat et assistant de l’Espace vendeur) sont enregistrées sur votre compte pour que vous les retrouviez sur vos appareils ; elles ne sont visibles que par vous et vous pouvez les supprimer à tout moment. Le contenu des fichiers joints n’est pas enregistré. L’enregistrement des conversations de l’assistant d’achat peut être désactivé dans les paramètres.</p>
      </section>

      <section>
        <h2>9. Assistant d’intelligence artificielle</h2>
        <p>Les réponses de l’assistant peuvent contenir des erreurs. Les résultats et conseils de l’Espace vendeur sont des estimations à partir des données saisies : ils ne constituent ni un résultat comptable ou fiscal certifié, ni un avis juridique.</p>
      </section>

      <section>
        <h2>10. Évolution des conditions</h2>
        <p>Ces conditions peuvent évoluer. La date de dernière mise à jour figure en haut de cette page.</p>
      </section>
    </div>
  )
}
