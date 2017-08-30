var fileResult = []; // résultats des traitements de qualification
var currentFile; // Fichier courant pour export
var updateMap; // fonction de mise à jour de carte
var geojsonLayer;

var SERCA_DNS = "https://www.serca.preprod.laposte.fr";
var SERCA_PWD = "BxImJIQZyC";

var SERCA_GEOPTIS_LOGIN = "geoptis";
var SERCA_GEOPTIS_PWD = ".ykLIemW2z";

// options pour séparer l'affichage jquery du traitement
var options = {
    "data_format" :"",
    "params": "deliverable,round,distribution_site,address_ids", // paramètres par défaut : + ban,rnvp,distribution_site_detail, cabin_site, address_reference
    "offline": "", // cpn,orgate
    "my_fields": "ALL",
    "notification_email":"",
    "csv_numeric_format": "excel_string",
    "exclude": "distribution_office",
    "cors": {
        "proxy": true, // Utilise un proxy cors pour serca et la ban
        "parallel": 4 // nombre de proxy cors en parallele pour appeler
    },
    "field_delimiter_input":";", // Séparateur pour le fichier CSV
    "field_delimiter_output":";"// Séparateur pour le fichier CSV en sortie
};

// Test if a field exist in an object
var isExistingField = function(obj, key) {
    var res = key.split(".").reduce(function(o, x) {
        return (typeof o == "undefined" || o === null) ? o : o[x];
    }, obj);
    if ( typeof res == "undefined" || res === null ) {
        return false;
    }
    else {
        return true;
    }
};

// Ajout d'un proxy cors pour appeler les services n'offrant pas de directives CORS
// A supprimer lorsque les services renverront les cors
function getCORSProxy(nbParallel) {

    if (!options.cors.proxy || nbParallel === 0) {
        return ""; //pas de proxy
    }
    else {
        var nbParallelCall = 0;
        if (!nbParallel) {
            nbParallelCall = Math.floor(Math.min( (options.cors.parallel || 4) , 15));
        }
        else {
            nbParallelCall= Math.floor(Math.min( nbParallel , 15));
        }
        return 'https://cors-proxy' + ( Math.floor(Math.random() * nbParallelCall) + 1) + '.seguret.org/';
    }
}

// Ajout d'un proxy cors (modification via fichier host local)
// A supprimer lorsque les traitements fichiers seront plus rapides
function getCORSProxyAPIQADR() {
    if (options.cors.proxy) {

        // **** A decommenter pour activer
         var nbParallelCall = Math.floor(Math.min( (options.cors.parallel || 4), 10)); // valeur par défaut 4, valeur max 10
         // renvoi de 4 proxy pour parralleliser encore plus les appels (contourne la limitation des navigateurs)
         return 'https://ws-apiqa' + ( Math.floor(Math.random() * nbParallelCall) + 1) + '.apps.paas.net-courrier.extra.laposte.fr/';
        //return "";
    }
    else {
        return "";
    }
}

function hoverPresentation(element) {
    element.setAttribute('src', 'img/presentation_service_hover.png');
}

function unhoverPresentation(element) {
    element.setAttribute('src', 'img/presentation_service.png');
}

function convertgeolocationTypeIdToExplicitLabel(idType){
    switch(idType) {
        case '1':
            return "1-city-center"; // 1	Centre commune
        case '2':
            return "2-city-hall"; // 2	mairie
        case '3':
            return "3-city-center"; // 3	Zone adressage
        case '4':
            return "4-road-center"; // 4	interpolée à la voie  (Centre voie)
        case '5':
            return "5-section-center"; // 5	Interpolation (Interpolée au tronçon)
        case '6':
            return "6-section"; // 6	Tronçon de voie
        case '7':
            return "7-field-center"; // 7	Projection centroïde (centre parcelle)
        case '8':
            return "8-housenumber"; // 8	A la plaque de rue (Projection plaque)
        default:
            return "10-unknown";
    }
}

function retrieveDataFormatFromHeaderCsvWithAddressRow(headerCsv) {
    var data_format="";
    var headers = headerCsv.split(options.field_delimiter_input);
    for ( var header in headers ) {
        if (header !== "0") {
            data_format+=";";
        }
        switch(headers[header]) {
            case "address_row1":
                data_format+="address_row1";
                break;
           case "address_row2":
                data_format+="address_row2";
                break;
           case "address_row3":
                data_format+="address_row3";
                break;
           case "address_row4":
                data_format+="address_row4";
                break;
           case "address_row5":
                data_format+="address_row5";
                break;
           case "address_row6":
                data_format+="address_row6";
                break;
           case "postal_code":
                data_format+="postal_code";
                break;
           case "locality":
                data_format+="locality";
                break;
           case "road_number": // Ajout du fait du format spécifique perféo
                data_format+="road_number";
                break;
           case "road_extension":
                data_format+="road_extension";
                break;
            case "road_name":
                data_format+="road_name";
                break;
            case "gender":
                data_format+="gender";
                break;
            case "first_name":
                data_format+="first_name";
                break;
            case "last_name":
                data_format+="last_name";
                break;
            case "insee_code":
                data_format+="insee_code";
                break;
            // case "geolocation":
            //     data_format+="geolocation";
            //     break;
            case "address_id":
                data_format+="address_id";
                break;
        }
    }
    return data_format;
}


function generateAPIQADRQueryURL(address) {

    var query = "?";
    var params = options.params || '';

    // on ajoute le parametre address_ids si geolocation et address_reference sont demandés
    // car ils ont besoin du address_ids.id
    if ( options.params.indexOf('geolocation') >= 0 || options.params.indexOf('address_reference') >= 0) {
        if ( options.params.indexOf('address_ids') < 0 ) {
            params += ",address_ids";
        }
    }

    query+= "params=" + params;

    if (options.notification_email !== "") {
        query+= "&notification_email=" + options.notification_email;
    }

    // Ajout du parametre data_format si non vide
    if ( options.data_format !== ""){
        // HACK : TODO FIX ME : le service unitaire actuel ne connait pas certains champs data_format
        query+= "&data_format=" + options.data_format.replace("gender","").replace("first_name","").replace("last_name","")
            .replace("last_name","")
            .replace("road_number","")
            .replace("road_extension","")
            .replace("road_name","")
            .replace("insee_code","")
            .replace("geolocation","")
            .replace("address_id","");
    }

    // Ajout du parametre my_fields si non vide
    if ( options.my_fields !== ""){
        query+= "&my_fields=" + options.my_fields;
    }

    // Ajout du parametre csv_numeric_format si non vide
    if ( options.csv_numeric_format !=="" ){
        query+= "&csv_numeric_format=" + options.csv_numeric_format;
    }

    // Ajout du parametre exclude si non vide
    if ( options.exclude !=="" ){
        query+= "&exclude=" + options.exclude;
    }

    // Ajout du parametre offline si non vide
    if ( options.offline !=="" ) {
        query+= "&offline=" + options.offline;
    }

    // Ajout des addresse si non vide
    if ( address ) {
        query += '&address_row1=' + address.address_row1 || '';
        query += '&address_row2=' + address.address_row2 || '';
        query += '&address_row3=' + address.address_row3 || '';
        query += '&address_row4=' + address.address_row4 || '';
        query += '&address_row5=' + address.address_row5 || '';
        query += '&address_row6=' + address.address_row6 || '';
    }

    return query;
}

function retrieveDatafromCsvRow(CSVRow, data_format) {

    var address= {
        "address_row1":"",
        "address_row2":"",
        "address_row3":"",
        "address_row4":"",
        "address_row5":"",
        "address_row6":""
    };
    var postal_code ="";
    var locality= "";
    var gender= "";
    var first_name= "";
    var last_name= "";
    var road_number= "";
    var road_extension= "";
    var road_name= "";

    var fields = CSVRow.split(options.field_delimiter_input);
    var formats = data_format.split(";");

    for ( var format in formats ) {
        // replace(/"/g, ' ') car certains fichiers client ont des " qui posent des problèmes lors de l'échappement excel =""
        switch(formats[format]) {
            case "address_row1":
                address.address_row1 = fields[format].replace(/"/g, ' ').trim() || '';
                break;
           case "address_row2":
                address.address_row2 = fields[format].replace(/"/g, ' ').trim() || '';
                break;
           case "address_row3":
                address.address_row3 = fields[format].replace(/"/g, ' ').trim() || '';
                break;
           case "address_row4":
                address.address_row4 = fields[format].replace(/"/g, ' ').trim() || '';
                break;
           case "address_row5":
                address.address_row5 = fields[format].replace(/"/g, ' ').trim() || '';
                break;
           case "address_row6":
                address.address_row6 = fields[format].replace(/"/g, ' ').trim() || '';
                break;
           case "postal_code":
                // certains fichiers client n'ont pas de 0 dans le début du code postal du fait d'excel 07340 --> 7340 : le service serca renvoi une erreur
                postal_code = ("0" + fields[format].replace(/"/g, ' ').trim()).slice(-5) || '';
                break;
           case "locality":
                locality = fields[format].replace(/"/g, ' ').trim() || '';
                break;
           case "gender":
                gender = fields[format].replace(/"/g, ' ').trim() || '';
                break;
           case "first_name":
                first_name = fields[format].replace(/"/g, ' ').trim() || '';
                break;
           case "last_name":
                last_name = fields[format].replace(/"/g, ' ').trim() || '';
                break;
           case "road_number":
                road_number = fields[format].replace(/"/g, ' ').trim() || '';
                break;
           case "road_extension":
                road_extension = fields[format].replace(/"/g, ' ').trim() || '';
                break;
           case "road_name":
                road_name = fields[format].replace(/"/g, ' ').trim() || '';
                break;
           case "insee_code": // champ pour analyse adresse non organisée
                address.insee_code = ("000000" + fields[format].replace(/"/g, ' ').trim()).slice(-5) || '';
                break;
        //    case "geolocation": // champ pour analyse adresse non organisée
        //         var google = proj4.Proj('EPSG:3857');
        //         var coord = fields[format].slice(6,-1).split(" ");
        //         fields[format] = proj4(google, proj4.WGS84).forward(coord).join("");
        //         break;
           case "insee_code-road_name": // champ pour geoptis : 31234 - rue des lilas
                var tmp =  fields[format].replace(/"/g, ' ').trim().split(" - ") || '';
                address.insee_code = tmp[0];
                road_name = tmp[1];
                break;
             case "address_id":
                address.address_id = ("000000" + fields[format].replace(/"/g, ' ').trim()).slice(-10) || '';
                break;
        }
    }

    // gestion de la ligne 1
    address.address_row1 = gender + ' ' + last_name + ' ' + first_name + ' ' + address.address_row1;
    address.address_row1 = address.address_row1.replace("  "," ");

    // gestion de la ligne 4
    address.address_row4 = road_number + ' ' + road_extension + ' ' + road_name + ' ' + address.address_row4;
    address.address_row4 = address.address_row4.replace("  "," ").trim();

    // gestion de la ligne 6
    if (postal_code !=="") {
        address.address_row6 += postal_code;
        if (locality !=="") {
            address.address_row6 += " " + locality;
        }
    }
    else {
        address.address_row6 += locality;
    }

    return address;
}

function mapChangeMarker(element) {
    updateMap(element);
    $("#mapSection").show();
}

function mapHighlightMarker(element) {
    var classes = element.className.split(" ");
    $(".map-selector-marker").css({opacity:0});
    $(".map-marker").css({opacity:0});
    $("." +classes[1]).css({opacity:1});
}

function mapUnHighlightMarker(element) {
    var classes = element.className.split(" ");
    $("." +classes[0]).css({opacity:1});
    $(".map-selector-marker").css({opacity:1});
    $(".map-marker").css({opacity:1});
}

function validateEmail(email) {
  var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(email);
}

function validateFileExtensionIsCSV(fileName) {
  var fileExtension = fileName.replace(/C:\\fakepath\\/i, '').split('.').pop().toUpperCase();
  if (fileExtension === "CSV") {
      return true;
  }
  else {
      return false;
  }
}

function excel_escape_numeric(value) {
    if (value === false) {
        value="false";
    }
    if ( options.csv_numeric_format ==="excel_string" && value !=="")
        return '="' + (value || '') + '"';
    else{
        return value || '';
    }
}

// Déplace le focus du navigateur
function scrollToAnchor(aid) {
    var aTag = $('a[name="'+ aid +'"]');
    $('html,body').animate( {scrollTop: aTag.offset().top}, 'slow' );
}

// Affiche l'état de progression du traitement
function displayTransfertStateProgression(params) {

    // limitation de rafraichissement car cela consomme beaucoup de ressource
    if ( params.nbCSVLinesProcessed <10 || params.nbCSVLinesProcessed>=params.nbCSVLinesTotal || params.nbCSVLinesProcessed % 10 === 0) {

        var progressionPct = Math.floor((params.nbCSVLinesProcessed/params.nbCSVLinesTotal) * 100);

        $("#file_transfer_state_progress_bar").attr("aria-valuenow", params.nbCSVLinesProcessed);
        $("#file_transfer_state_progress_bar").attr("aria-valuemin","0");
        $("#file_transfer_state_progress_bar").attr("aria-valuemax", (params.nbCSVLinesTotal -1) );
        $("#file_transfer_state_progress_bar").attr("style","width: "+ progressionPct +"%;");
        $("#nbCSVLinesProcessed").text( params.nbCSVLinesProcessed );
        $("#nbCSVLinesTotal").text( (params.nbCSVLinesTotal -1) );
        $("#file_transfer_state_remaining_time").text( ", temps restant estimé : " + moment.duration(params.remainingTimeInSeconds, "seconds").humanize() );
        $("#file_transfer_state").show();
        $("#file_success_local_nbCSVLinesError").text(params.nbCSVLinesError);
        if ( params.nbCSVLinesError > 0 ) {
            $("#file_success_local_errors").show();
        }
        else {
            $("#file_success_local_errors").hide();
        }

    }

    return true;
}

// // attention a bien conserver l'ordre des champs pour éviter les effets de bords chez les utilisateurs
// qui font du copier-coller dans le cadre de la planification
function generateHeaderCSV(CSVOriginData) {
    //var resultCSV = CSVOriginData.replace(";","\;").replace(new RegExp(options.field_delimiter_input, 'g'),options.field_delimiter_output);// TODO test excel escape
    // hack : fonctionne seulement avec geoptis/panoptes qui est mal formaté
    var resultCSV = CSVOriginData.replace(";","\;").replace(options.field_delimiter_input,options.field_delimiter_output).replace(options.field_delimiter_input,options.field_delimiter_output).replace(options.field_delimiter_input,options.field_delimiter_output).replace(options.field_delimiter_input,options.field_delimiter_output);// TODO test excel escape

    if ( options.params.indexOf("deliverable") >= 0 ) {
        resultCSV += options.field_delimiter_output + 'deliverable';
    }
    if ( options.params.indexOf("round") >= 0 ) {
        resultCSV += options.field_delimiter_output + 'round.id';
        resultCSV += options.field_delimiter_output + 'round.rank';
        resultCSV += options.field_delimiter_output + 'round.label';
    }
    if ( options.params.indexOf("address_ids") >= 0 ) {
        resultCSV += options.field_delimiter_output + 'address_ids.id';
        resultCSV += options.field_delimiter_output + 'address_ids.internal_service';
        resultCSV += options.field_delimiter_output + 'address_ids.cedex_id';
        resultCSV += options.field_delimiter_output + 'address_ids.row3';
        resultCSV += options.field_delimiter_output + 'address_ids.row4_number';
        resultCSV += options.field_delimiter_output + 'address_ids.row4_road';
        resultCSV += options.field_delimiter_output + 'address_ids.row56';
        resultCSV += options.field_delimiter_output + 'address_ids.type';
    }
    if ( options.params.indexOf("distribution_site") >= 0 ) {
        resultCSV += options.field_delimiter_output + 'distribution_site.id';
        resultCSV += options.field_delimiter_output + 'distribution_site.id_roc';
        resultCSV += options.field_delimiter_output + 'distribution_site.label';
    }
    if ( options.params.indexOf("distribution_site_detail") >= 0 ) {
        resultCSV += options.field_delimiter_output + 'distribution_site.address.row3';
        resultCSV += options.field_delimiter_output + 'distribution_site.address.row4';
        resultCSV += options.field_delimiter_output + 'distribution_site.address.row5';
        resultCSV += options.field_delimiter_output + 'distribution_site.address.row6';
        resultCSV += options.field_delimiter_output + 'distribution_site.address.row7';
    }
    if ( options.params.indexOf("cabin_site") >= 0 ) {
        resultCSV += options.field_delimiter_output + 'cabin_site.id';
        resultCSV += options.field_delimiter_output + 'cabin_site.id_roc';
    }
    if ( options.params.indexOf("geolocation") >= 0 ) {
        resultCSV += options.field_delimiter_output + 'geolocation.coordinates';
        resultCSV += options.field_delimiter_output + 'geolocation.type';
    }
    if ( options.params.indexOf("address_reference") >= 0 ) {
        resultCSV += options.field_delimiter_output + 'address_reference.address_row1';
        resultCSV += options.field_delimiter_output + 'address_reference.address_row2';
        resultCSV += options.field_delimiter_output + 'address_reference.address_row3';
        resultCSV += options.field_delimiter_output + 'address_reference.address_row4';
        resultCSV += options.field_delimiter_output + 'address_reference.address_row5';
        resultCSV += options.field_delimiter_output + 'address_reference.address_row6';
    }
    if ( options.params.indexOf("rnvp") >= 0 ) {
        resultCSV += options.field_delimiter_output + 'rnvp.address_row1';
        resultCSV += options.field_delimiter_output + 'rnvp.address_row2';
        resultCSV += options.field_delimiter_output + 'rnvp.address_row3';
        resultCSV += options.field_delimiter_output + 'rnvp.address_row4';
        resultCSV += options.field_delimiter_output + 'rnvp.address_row5';
        resultCSV += options.field_delimiter_output + 'rnvp.address_row6' ;
        resultCSV += options.field_delimiter_output + 'rnvp.status' ;
        resultCSV += options.field_delimiter_output + 'rnvp.message ';
    }
    if ( options.params.indexOf("ban") >= 0 ) {
        resultCSV += options.field_delimiter_output + 'ban.id';
        resultCSV += options.field_delimiter_output + 'ban.label';
        resultCSV += options.field_delimiter_output + 'ban.citycode';
        resultCSV += options.field_delimiter_output + 'ban.coordinates' ;
        resultCSV += options.field_delimiter_output + 'ban.type' ;
        resultCSV += options.field_delimiter_output + 'ban.score';
        resultCSV += options.field_delimiter_output + 'ban.status';
    }
    if ( options.params.indexOf("address_to_address_list") >= 0 ) {
        // pour geoptis
        resultCSV += options.field_delimiter_output + 'address_row3';
        resultCSV += options.field_delimiter_output + 'address_row4';
        resultCSV += options.field_delimiter_output + 'address_row5';
        resultCSV += options.field_delimiter_output + 'address_row6' ;
        resultCSV += options.field_delimiter_output + 'geolocation.coordinates';
        resultCSV += options.field_delimiter_output + 'geolocation.type';
    }
    resultCSV += options.field_delimiter_output + 'status' ;
    return resultCSV;
}

function convertToCSVOutputFormat(CSVOriginData, qualificationResult) {

    var resultCSV = "";
    // /!\ Attention : bien conserver l'ordre des champs pour éviter les effets de bords chez les utilisateurs
    // qui font du copier-coller dans le cadre de la planification
    // /!\ Attention certains champs ne sont pas échappés car non numériques
    if ( options.params.indexOf("address_to_address_list") < 0 ) {

        //var resultCSV = CSVOriginData.replace(";","\;").replace(new RegExp(options.field_delimiter_input, 'g'),options.field_delimiter_output);// TODO test excel escape
        // hack : fonctionne seulement avec geoptis/panoptes qui est mal formaté
        resultCSV += CSVOriginData.replace(";","\;").replace(options.field_delimiter_input,options.field_delimiter_output).replace(options.field_delimiter_input,options.field_delimiter_output).replace(options.field_delimiter_input,options.field_delimiter_output).replace(options.field_delimiter_input,options.field_delimiter_output);// TODO test excel escape
        // resultCSV = resultCSV.replace(new RegExp(" 0;1.", 'g')," 0,1.");// hack fichier geoptis mal formaté
        if ( options.params.indexOf("deliverable") >= 0 ) {
            resultCSV += options.field_delimiter_output + qualificationResult.deliverable;
        }
        if ( options.params.indexOf("round") >= 0 ) {
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.round.id || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.round.rank || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.round.label || '');
        }
        if ( options.params.indexOf("address_ids") >= 0 ) {
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.address_ids.id || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.address_ids.internal_service || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.address_ids.cedex_id || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.address_ids.row3 || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.address_ids.row4_number || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.address_ids.row4_road || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.address_ids.row56 || '');
            resultCSV += options.field_delimiter_output + qualificationResult.address_ids.type;
        }
        if ( options.params.indexOf("distribution_site") >= 0 ) {
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.distribution_site.id || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.distribution_site.id_roc || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.distribution_site.label || '');
        }
        if ( options.params.indexOf("distribution_site_detail") >= 0 ) {
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.distribution_site.address.row3 || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.distribution_site.address.row4 || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.distribution_site.address.row5 || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.distribution_site.address.row6 || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.distribution_site.address.row7 || '');
        }
        if ( options.params.indexOf("cabin_site") >= 0 ) {
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.cabin_site.id || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.cabin_site.id_roc || '');
        }
        if ( options.params.indexOf("geolocation") >= 0 ) {
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.geolocation.coordinates || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.geolocation.type || '');
        }
        if ( options.params.indexOf("address_reference") >= 0 ) {
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.address_reference.address_row1 || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.address_reference.address_row2 || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.address_reference.address_row3 || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.address_reference.address_row4 || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.address_reference.address_row5 || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.address_reference.address_row6 || '');
        }
        if ( options.params.indexOf("rnvp") >= 0 ) {
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.rnvp.address_row1 || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.rnvp.address_row2 || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.rnvp.address_row3 || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.rnvp.address_row4 || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.rnvp.address_row5 || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.rnvp.address_row6 || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.rnvp.status || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.rnvp.message || '');
        }
        if ( options.params.indexOf("ban") >= 0 ) {
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.ban.id || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.ban.label || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.ban.citycode || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.ban.coordinates || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.ban.type || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.ban.score || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.ban.status || '');
        }
        resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.status.join(',') || '');
    }
    else {
        // pour geoptis, une ligne en entrée devient plusieurs lignes en sortie
        for (var index in qualificationResult.address_list) {
            if (resultCSV !== "") {
                resultCSV += "\r\n";
            }
            //var resultCSV = CSVOriginData.replace(";","\;").replace(new RegExp(options.field_delimiter_input, 'g'),options.field_delimiter_output);// TODO test excel escape
            // hack : fonctionne seulement avec geoptis/panoptes qui est mal formaté
            resultCSV += CSVOriginData.replace(";","\;").replace(options.field_delimiter_input,options.field_delimiter_output).replace(options.field_delimiter_input,options.field_delimiter_output).replace(options.field_delimiter_input,options.field_delimiter_output).replace(options.field_delimiter_input,options.field_delimiter_output);// TODO test excel escape
            //resultCSV = resultCSV.replace(new RegExp(" 0;1.", 'g')," 0,1.");// hack fichier geoptis mal formaté
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.address_list[parseInt(index)].address_row3 || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.address_list[parseInt(index)].address_row4 || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.address_list[parseInt(index)].address_row5|| '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.address_list[parseInt(index)].address_row6 || '');
            resultCSV += options.field_delimiter_output + (qualificationResult.address_list[parseInt(index)].geolocation.coordinates || '');
            resultCSV += options.field_delimiter_output + (qualificationResult.address_list[parseInt(index)].geolocation.type || '');
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.status.join(',') || '');

        }
        if (resultCSV === "") {
            // pas de données récupérées pour geoptis
            //var resultCSV = CSVOriginData.replace(";","\;").replace(new RegExp(options.field_delimiter_input, 'g'),options.field_delimiter_output);// TODO test excel escape
            // hack : fonctionne seulement avec geoptis/panoptes qui est mal formaté
            resultCSV += CSVOriginData.replace(";","\;").replace(options.field_delimiter_input,options.field_delimiter_output).replace(options.field_delimiter_input,options.field_delimiter_output).replace(options.field_delimiter_input,options.field_delimiter_output).replace(options.field_delimiter_input,options.field_delimiter_output);// TODO test excel escape
            //resultCSV = resultCSV.replace(new RegExp(" 0;1.", 'g')," 0,1.");// hack fichier geoptis mal formaté
            resultCSV += options.field_delimiter_output +  '';
            resultCSV += options.field_delimiter_output +  '';
            resultCSV += options.field_delimiter_output +  '';
            resultCSV += options.field_delimiter_output +  '';
            resultCSV += options.field_delimiter_output +  '';
            resultCSV += options.field_delimiter_output +  '';
            resultCSV += options.field_delimiter_output + excel_escape_numeric(qualificationResult.status.join(',') || '');
        }
    }
    return resultCSV;
}

// transforme des données csv en geoJson
function convertCSVToGeoJSONOutputFormat(csvData) {

    var returnGeoJSON = { "type": "FeatureCollection","features": []};
    var returnGeoJSONFeature = {};

    var colsHeader = csvData[0].split(options.field_delimiter_output);
    var nbCols = colsHeader.length;
    var colCoordinates = 0;

    // récupere la colonne de coordonnées
    for (var j = 0; j < nbCols; j++) {

        // la geolocalisation de la ban est retenue si la geolocalisation de l'API n'est pas présente
        if ( colsHeader[j] === "ban.coordinates" ) {
            colCoordinates = j;
        }
        if ( colsHeader[j] === "geolocation.coordinates" ) {
            colCoordinates = j;
            break;
        }
    }
    // dans le cas de geopti/panotes, le csvData a des \n qui ne sont pas en array
    csvData = csvData.join("\n").split("\n");

    var nbRows = csvData.length;
    var row = [];

    for (var i = 1; i < nbRows; i++) {
        if (typeof csvData[i] === "string") {
            row = csvData[i].split(options.field_delimiter_output);
            if (row[colCoordinates] !== "" && row[colCoordinates] !== "[]" && row[colCoordinates] !== '=""') {

                    returnGeoJSONFeature = {
                        "type": "Feature",
                        "geometry": {
                            "type": "Point",
                            "coordinates": []
                        },
                        "properties": {
                        }
                    };
                    // pour tests offline
                    //returnGeoJSONFeature.geometry.coordinates = [( Number(row[colCoordinates].slice(2, -1).split(",")[0]) + Math.random() ), (Number(row[colCoordinates].slice(2, -1).split(",")[1]) +  Math.random() )];
                    if (row[colCoordinates].indexOf('="') === 0 ) {
                        // suppression echappement excel
                        returnGeoJSONFeature.geometry.coordinates = [( Number(row[colCoordinates].slice(2, -1).split(",")[0]) ), (Number(row[colCoordinates].slice(2, -1).split(",")[1]) )];
                    }
                    else {
                        returnGeoJSONFeature.geometry.coordinates = [( Number(row[colCoordinates].split(",")[0]) ), (Number(row[colCoordinates].split(",")[1]) )];
                    }

                    for (var k = 0; k < nbCols; k++) {
                        // On teste si on a des échappements de car de type excel = ""
                        if (row[k].indexOf('="') === 0 ) {
                            returnGeoJSONFeature.properties[colsHeader[k]] = row[k].slice(2, -1);
                        }
                        else {
                            returnGeoJSONFeature.properties[colsHeader[k]] = row[k];
                        }
                    }
                    returnGeoJSON.features.push(returnGeoJSONFeature);
            }
        }
    }
    return returnGeoJSON;
}

// Sauvegarde le fichier sur le poste client avec une gestion d'accents
function saveFileWithDownload() {
    // use FileSaver to export file
    var BOM = "\uFEFF"; //%EF%BB%BF
    var blob = new Blob([BOM + fileResult.join('\n')], {type: "text/csv;charset=utf-8"});
    saveAs(blob, currentFile.name.split('.')[0] + '_' + moment().format("YYYY-MM-DD_HH-mm-ss") + '_resultat.csv');
}

// Lit le fichier en local et définit le type de fichier en fonction de la première ligne
function retrieveDataFormat(files) {
    if (window.FileReader) {
        // FileReader are supported.
        var reader = new FileReader();
        // Read file into memory as UTF-8
        //reader.readAsText(files[0],'ASCII'); // OK except IE11
        //reader.readAsText(files[0]); // KO IE11
        //reader.readAsDataURL(files[0]); // KO IE11
        //reader.readAsArrayBuffer(files[0]); // KO IE11
        //reader.readAsText(files[0],'UTF-8'); // KO IE11
        reader.readAsText(files[0], 'ISO-8859-1');
        //reader.readAsText(files[0], 'CP1251'); // KO IE11

        currentFile = files[0];
        // Handle errors load
        reader.onload = function(event) {

            // conserve uniquement la premiere ligne
            var firstLine = event.target.result.split(/\r\n|\n/).shift();

            // teste la premiere ligne
            if ( firstLine.indexOf("Date de début souhaitée;Référence Bénéficiaire;Nom Prénom ou Raison sociale;Lieu de remise;N° ou Boite aux lettres - Couloir-Escalier;Numéro et libellé de voie;Complément commune ou service postal;Code postal;Localité") === 0 || firstLine.indexOf("Date de dibut souhaitie;Rifirence Binificiaire;Nom Prinom ou Raison sociale;Lieu de remise;N0 ou Boite aux lettres - Couloir-Escalier;Numiro et libelli de voie;Compliment commune ou service postal;Code postal;Localiti;Indication d'acchs au binificiaire;Indications complimentaires") === 0 || firstLine.indexOf("Date de début souhaitée;Référence Bénéficiaire;Nom Prénom ou Raison sociale;Lieu de remise;N° ou Boite aux lettres - Couloir-Escalier;Numéro et Libellé de Voie;Complément Commune;Code Postal;Localité") === 0 || firstLine.indexOf("Date de début souhaitée;Référence bénéficiaire;Nom Prénom ou Raison sociale;Lieu de remise;N° ou Boîte aux lettres - Couloir-Escalier;Numéro et libellé de voie;Complément commune ou service postal;Code postal;Localité;Indication d'accès au bénéficiaire;Indications complémentaires") === 0) {
                // Format FSPlus sans Action identifié
                options.data_format = ";;address_row1;address_row2;address_row3;address_row4;address_row5;postal_code;locality";
                $("#data_format").val(options.data_format);
                $("#data_format_fsplus1").prop("checked", true);
                $("#data_format_alert").hide();
                $("#data_format_success").show();
            }
            else if ( firstLine.indexOf("Action;Date de début souhaitée;Référence Bénéficiaire;Nom Prénom ou Raison sociale;Lieu de remise;N° ou Boite aux lettres - Couloir-Escalier;Numéro et libellé de voie;Complément commune ou service postal;Code postal;Localité") === 0 ||  firstLine.indexOf("Action;Date de dibut souhaitie;Rifirence Binificiaire;Nom Prinom ou Raison sociale;Lieu de remise;N0 ou Boite aux lettres - Couloir-Escalier;Numiro et libelli de voie;Compliment commune ou service postal;Code postal;Localiti;Indication d'acchs au binificiaire;Indications complimentaires") === 0 ||  firstLine.indexOf("Action;Date de début souhaitée;Référence Bénéficiaire;Nom Prénom ou Raison sociale;Lieu de remise;N° ou Boite aux lettres - Couloir-Escalier;Numéro et Libellé de Voie;Complément Commune;Code Postal;Localité") === 0 || firstLine.indexOf("Action;Date de début souhaitée;Référence bénéficiaire;Nom Prénom ou Raison sociale;Lieu de remise;N° ou Boîte aux lettres - Couloir-Escalier;Numéro et libellé de voie;Complément commune ou service postal;Code postal;Localité;Indication d'accès au bénéficiaire;Indications complémentaires") === 0) {
                // Format FSPlus avec Action identifié
                options.data_format = ";;;address_row1;address_row2;address_row3;address_row4;address_row5;postal_code;locality";
                $("#data_format").val(options.data_format);
                $("#data_format_fsplus2").prop("checked", true);
                $("#data_format_alert").hide();
                $("#data_format_success").show();
            }
            else if ( firstLine.indexOf("reference_client_beneficiaire;cea;civilite;prenom;nom;l2;l3;numero;extension;libelle_voie;l5;code_postal;localite_destination") === 0) {
                // Format Perfeo
                options.data_format = ";;gender;first_name;last_name;address_row2;address_row3;road_number;road_extension;road_name;address_row5;postal_code;locality";
                $("#data_format").val(options.data_format);
                $("#data_format_libre").prop("checked", true);
                $("#data_format_alert").hide();
                $("#data_format_success").show();
            }
            else if ( firstLine.indexOf("address_row") > 0) {
                // Format libre identifié
                options.data_format = retrieveDataFormatFromHeaderCsvWithAddressRow(firstLine);
                $("#data_format").val(options.data_format);
                $("#data_format_libre").prop("checked", true);
                $("#data_format_alert").hide();
                $("#data_format_success").show();
            }
            // A conserver après  firstLine.indexOf("address_row") > 0 pour les fichiers geoptis/panoptes traités en 2 temps
            else if ( firstLine.indexOf("INDICE,LONGUEUR,VOIE,NOMCOM,GEOMETRIE,,") === 0) {
                // Format Geoptis/panoptes
                options.data_format = ";;insee_code-road_name;;";
                $("#data_format").val(options.data_format);
                options.field_delimiter_input=",";
                $("#field_delimiter_input").val(options.field_delimiter_input);
                $("#data_format_libre").prop("checked", true);
                $("#data_format_alert").hide();
                $("#data_format_success").show();
            }
            // A conserver après  firstLine.indexOf("address_row") > 0 pour les fichiers analyse organisation de BCAA traités en 2 temps
            else if ( firstLine.indexOf("insee;localité;cea;voie;géométrie;srid;code géométrie") === 0 || firstLine.indexOf("insee;localitÃ©;cea;voie;gÃ©omÃ©trie;srid;code gÃ©omÃ©trie") === 0) {
                // Format BCAA analyse organisation voie
                options.data_format = "insee_code;locality;address_id;address_row4;;";
                $("#data_format").val(options.data_format);
                options.field_delimiter_input=";";
                $("#data_format_libre").prop("checked", true);
                $("#data_format_alert").hide();
                $("#data_format_success").show();
            }
            // A conserver après  firstLine.indexOf("address_row") > 0 pour les fichiers analyse organisation de BCAA traités en 2 temps
            else if ( firstLine.indexOf("insee;localité;cea;ligne 3;numéro;extension;voie;géométrie;srid;code géométrie") === 0 ) {
                // Format BCAA analyse organisation numéro de de voie
                options.data_format = "insee_code;locality;address_id;address_row3;road_number;road_extension;road_name;;";
                $("#data_format").val(options.data_format);
                options.field_delimiter_input=";";
                $("#data_format_libre").prop("checked", true);
                $("#data_format_alert").hide();
                $("#data_format_success").show();
            }
            else {
                $("#data_format_alert").show();
                $("#data_format_libre").prop("checked", true);
                $("#data_format_success").hide();
            }
        };
    }
}

// lit le fichier fournit et lance les traitements en unitaire
function retrieveInformationsFromFile(file) {

    // réinitialisation des résultats
    fileResult = [];

    if (window.FileReader) {
        // FileReader are supported.
        var reader = new FileReader();
        // Read file into memory as UTF-8
        reader.readAsText(file, 'ISO-8859-1');
        // Handle errors load
        reader.onload = function(event) {
            var remainingTimeInSeconds= 0;
            var startTimestampInSecond= Math.floor(Date.now() / 1000);
            var csvLines = event.target.result.split(/\r\n|\n/);
            var nbCSVLinesTotal = csvLines.length -1; //-1 car il y a l'entete de fichier csv
            var nbCSVLinesProcessed = 1;
            var nbCSVLinesError = 0;
            var progressionPct = 0;

            displayTransfertStateProgression({
                                    nbCSVLinesProcessed:nbCSVLinesProcessed,
                                    nbCSVLinesTotal:nbCSVLinesTotal,
                                    remainingTimeInSeconds:remainingTimeInSeconds,
                                    nbCSVLinesError:nbCSVLinesError});

            // 8 * (options.cors.parallel || 1) : limite de parrallelisme possible pour un nom de domaine : 6 pour chrome, 8 pour IE
            async.forEachOfLimit(csvLines, (6 * (options.cors.parallel || 1)), function (CSVLineOrigin, currentLineId, callbackParrallel) {

                var externalCallError = false; // indique s'il y a eu des erreurs d'appels de service

                if (nbCSVLinesProcessed < nbCSVLinesTotal && CSVLineOrigin !=="") {
                    // bug async? : ajoute des lignes en plus en fin : CSVLineOrigin.length >2 les supprime

                    fileResult[currentLineId] = [];
                    if ( currentLineId === 0 ) {
                        // gestion particulière pour l'entête
                        fileResult[currentLineId] = generateHeaderCSV(CSVLineOrigin);
                    }
                    else if (currentLineId !== 0 && CSVLineOrigin.length >2 ) {
                        var responseJson = {
                            "address": {
                                "address_row1": "",
                                "address_row2": "",
                                "address_row3": "",
                                "address_row4": "",
                                "address_row5": "",
                                "address_row6": "",
                                "status": "",
                                "message": "",
                            },
                            "deliverable": "",
                            "round": {
                                "id": "",
                                "rank": "",
                                "label": ""
                            },
                            "address_ids": {
                                "id": "",
                                "internal_service": "",
                                "cedex_id": "",
                                "row3": "",
                                "row4_number": "",
                                "row4_road": "",
                                "row56": "",
                                "type": ""
                            },
                            "distribution_site": {
                                "id": "",
                                "id_roc": "",
                                "label":"",
                                "address": {
                                    "address_row3": "",
                                    "address_row4": "",
                                    "address_row5": "",
                                    "address_row6": "",
                                    "address_row7": ""
                                }
                            },
                            "cabin_site": {
                                "id": "",
                                "id_roc": ""
                            },
                            "rnvp": {
                                "address_row1": "",
                                "address_row2": "",
                                "address_row3": "",
                                "address_row4": "",
                                "address_row5": "",
                                "address_row6": "",
                                "status": "",
                                "message": "",
                            },
                            "address_reference": {
                                "address_row1": "",
                                "address_row2": "",
                                "address_row3": "",
                                "address_row4": "",
                                "address_row5": "",
                                "address_row6": "",
                            },
                            "geolocation": {
                                "coordinates": [],
                                "type": "",
                            },
                            "ban": {
                                "id": "",
                                "label": "",
                                "citycode": "",
                                "coordinates": [],
                                "type": "",
                                "score": "",
                                "status": "",
                            },
                            "address_list": [],
                            "status": []
                        };

                        var address = retrieveDatafromCsvRow(CSVLineOrigin, options.data_format);

                        // Lancement des traitements en série
                        async.series([
                            // Appel du traitement serca pour geoptis address+ insee --> address_list
                            function serca_address_to_address_list(callback) {

                                if ( options.params.indexOf("address_to_address_list")>=0 ) {
                                    callSercaAddressToAddressList(address, function (error, qualificationResultAddressToAddressList){

                                        responseJson.address_list = qualificationResultAddressToAddressList.address_list;
                                        if (qualificationResultAddressToAddressList.status && qualificationResultAddressToAddressList.status !=="") {
                                            responseJson.status.push(qualificationResultAddressToAddressList.status);
                                            externalCallError = true;
                                        }
                                        if (error) {
                                            /// return callback(error);
                                            externalCallError = true;
                                        }
                                        callback(error, 'traitementSercaAddressToAddressList');
                                    });
                                }
                                else{
                                     callback(null, 'traitementSercaAddressToAddressList');
                                }
                            },
                            // Appel du redressement d'adresse
                            function serca_rnvp(callback) {

                                if ( options.params.indexOf("rnvp")>=0 ) {
                                    callRNVPSerca(address, function (error, qualificationResultRNVPSerca){

                                        if (qualificationResultRNVPSerca.rnvp) {
                                            address = qualificationResultRNVPSerca.rnvp;
                                        }
                                        responseJson.rnvp = qualificationResultRNVPSerca.rnvp;
                                        if (qualificationResultRNVPSerca.status && qualificationResultRNVPSerca.status !=="") {
                                            responseJson.status.push(qualificationResultRNVPSerca.status);
                                            externalCallError = true;
                                        }
                                        if (error) {
                                            /// return callback(error);
                                            externalCallError = true;
                                        }
                                        callback(error, 'traitementserca');
                                    });
                                }
                                else{
                                     callback(null, 'traitementserca');
                                }
                            },
                            // Appel du traitement de qualification (deliverable,ditribution_site,round,address_ids)
                            function qualification(callback) {
                                // l'appel n'est réalisé que si un autre parametre que rnvp, ban ou address_to_address_list est demandé
                                // deliverable, round, distribution_site, address_ids,cabin_site nécessitent ce traitement
                                // address_reference, geolocation nécessitent le address_ids.id récupéré par ce traitement

                                var needQualification = false;
                                if ( ( ! address.address_id ) && ( options.params.indexOf("address_reference") >= 0 || options.params.indexOf("geolocation") >= 0 ) ) {
                                    needQualification = true;
                                }
                                if ( options.params.replace(",","").replace("rnvp","").replace("ban","").replace("address_reference","").replace("geolocation","").replace("address_to_address_list","") !== "" ) {
                                    needQualification = true;
                                }

                                if ( needQualification) {

                                    addQualification(address, function (error, qualificationResult){

                                        if ( isExistingField(qualificationResult, "deliverable" )  ) {
                                            responseJson.deliverable = qualificationResult.deliverable;
                                        }
                                        if ( isExistingField(qualificationResult, "distribution_site" )  ) {
                                            responseJson.distribution_site = qualificationResult.distribution_site;
                                        }
                                        if ( isExistingField(qualificationResult, "cabin_site" )  ) {
                                            responseJson.cabin_site = qualificationResult.cabin_site;
                                        }
                                        if ( isExistingField(qualificationResult, "round" )  ) {
                                            responseJson.round = qualificationResult.round;
                                        }
                                        if ( isExistingField(qualificationResult, "address_ids" )  ) {
                                            responseJson.address_ids = qualificationResult.address_ids;
                                        }
                                        if (qualificationResult.status && qualificationResult.status !=="") {
                                            responseJson.status.push(qualificationResult.status);
                                            externalCallError = true;
                                        }
                                        if (error) {
                                            /// return callback(error);
                                            externalCallError = true;
                                        }
                                        callback(error, 'traitementqualification');
                                    });
                                }
                                else {
                                    callback(null, 'aucuntraitementqualification');
                                }
                            },
                            // Appel du traitement d'identifiant d'adresse et de geolocalisation (serca cea)
                            function serca_geolocation_address_reference(callback) {
                                // l'appel n'est réalisé que si la geolocation ou l'adresse de référence est demandée
                                if ( ( responseJson.address_ids.id !== "" || address.address_id) && options.params.indexOf("address_reference") >= 0 || options.params.indexOf("geolocation") >= 0) {
                                    var address_id = responseJson.address_ids.id || address.address_id || '';
                                    addRANAddressAndGeolocation(address_id, function (error, qualificationResult){
                                        if (qualificationResult.geolocation) {
                                            responseJson.geolocation = qualificationResult.geolocation;
                                        }
                                        if (qualificationResult.address_reference) {
                                            responseJson.address_reference = qualificationResult.address_reference;
                                        }
                                        if (qualificationResult.status !=="") {
                                            responseJson.status.push(qualificationResult.status);
                                            externalCallError = true;
                                        }
                                        if (error) {
                                            /// return callback(error);
                                            externalCallError = true;
                                        }
                                        callback(error, 'traitementqualificationcea');
                                    });
                                }
                                else {
                                    callback(null, 'aucuntraitementcea');
                                }
                            },
                            // Appel du traitement ban :base_adresse_nationale
                            function base_adresse_nationale(callback) {
                                // l'appel n'est réalisé que si la ban est demandée
                                if ( options.params.indexOf("ban") >= 0 ) {
                                    addBaseAdresseNationale(address, function (error, qualificationResult){
                                        if (qualificationResult) {
                                            responseJson.ban = qualificationResult;
                                        }
                                        if (error) {
                                            responseJson.status.push(error);
                                            externalCallError = true;
                                        }
                                        callback(error, 'base_adresse_nationale');
                                    });
                                }
                                else {
                                    callback(null, 'base_adresse_nationale');
                                }
                            }
                        ],
                        // Fonction appelée après que toutes les tâches "series" soient réalisées
                        function async_end(err, results) {
                            //if (err) return next(err);
                            nbCSVLinesProcessed++;
                            if ( externalCallError ) {
                                nbCSVLinesError++;
                            }
                            fileResult[currentLineId] = convertToCSVOutputFormat(CSVLineOrigin, responseJson);

                            remainingTimeInSeconds = ((Math.floor(Date.now() / 1000) - startTimestampInSecond) * nbCSVLinesTotal / (nbCSVLinesProcessed-1) ) - (Math.floor(Date.now() / 1000) - startTimestampInSecond + 20);
+
                            displayTransfertStateProgression({
                                    nbCSVLinesProcessed:nbCSVLinesProcessed,
                                    nbCSVLinesTotal:nbCSVLinesTotal,
                                    remainingTimeInSeconds:remainingTimeInSeconds,
                                    nbCSVLinesError:nbCSVLinesError});

                            if (nbCSVLinesProcessed >= nbCSVLinesTotal) {
                                displayPanelhideOthers("#file_success_local");
                            }
                            callbackParrallel();
                        });
                    }
                }
            }, function (err) {
                if (err) console.error(err.message);
                // configs is now a map of JSON data
                //doSomethingWith(configs);
            });
        };
    }
}

function addQualification(address, callback) {
    var result = {
        status: "SERVER_ERROR_QUALIF"
    };

    $.ajax({
        url: getCORSProxyAPIQADR() + '/address/v1/single_analysis' + generateAPIQADRQueryURL(address),
        json: true,
        async: true,
        type : 'GET',
        tryCount : 0,
        retryLimit : 6,
        timeout: 3000, // pose une limite de temps sur les appels, en dessus de ce temps le servce distant est Ko
        crossDomain: true,
        success : function(qualificationResult) {
            qualificationResult.status="";
            // test qualificationResult.round.id += Math.floor(Math.random() * 20);
            callback(null, qualificationResult);
        },
        error : function(xhr, textStatus, errorThrown ) {
            this.tryCount++;
            if (this.tryCount <= this.retryLimit) {
                // try again with exponential backoff
                var that=this;
                setTimeout(function() {
                    $.ajax(that);
                }, ( (this.tryCount * 600) + Math.floor(Math.random() * 100)) );
            }
            else {
                // Dans le cas d'erreurs multiples après plusieurs essais
                callback(result.status, result);
            }
        }
    });
}

function addBaseAdresseNationale(address, callback) {
    var result = {
        status: "SERVER_ERROR_BAN"
    };

    $.ajax({
        url: getCORSProxy() + 'https://api-adresse.data.gouv.fr/search/?q=' + address.address_row1.trim() + ' ' + address.address_row2.trim() + ' '+ address.address_row3.trim() + ' '+ address.address_row4.trim() + ' '+ address.address_row5.trim() + ' '+ address.address_row6.trim() + '&type=street&limit=1',
        json: true,
        async: true,
        type : 'GET',
        tryCount : 0,
        retryLimit : 6,
        timeout: 7000, // pose une limite de temps sur les appels, en dessus de ce temps le servce distant est Ko
        crossDomain: true,
        success : function(qualificationResult) {
            result.status="";
            callback(null, formatBaseAdresseNationaleResult(qualificationResult));
        },
        error : function(xhr, textStatus, errorThrown ) {
            this.tryCount++;
            if (this.tryCount <= this.retryLimit) {
                // try again with exponential backoff
                var that=this;
                setTimeout(function() {
                    $.ajax(that);
                }, ( (this.tryCount * 600) + Math.floor(Math.random() * 100)) );
            }
            else {
                // Dans le cas d'erreurs multiples après plusieurs essais
                callback(result.status, result);
            }
        }
    });
}

function addRANAddressAndGeolocation(address_ids_id, callback) {

    var result = {
        status: "SERVER_ERROR_ADDRESS_IDS__ID",
    };

    // Si l'identifiant d'adresse n'est pas fournit on renvoit un traitement KO
    if (!address_ids_id) {
        result.status="NO_ADDRESS_IDS__ID";
        callback(null, sendResultRANAddressAndGeolocation(result));
    }
    else {

        var query = getCORSProxy() + SERCA_DNS + '/services/cea/getCeaAdresse?optionActive=1&optionDiffusable=1&typeResultat=json&cea=' + address_ids_id  + '&idClient=apiqadr&passwdClient=' + SERCA_PWD;

        $.ajax({
            url: query,
            json: true,
            async: true,
            type : 'GET',
            tryCount : 0,
            retryLimit : 6,
            timeout: 3000, // pose une limite de temps sur les appels, en dessus de ce temps le servce distant est Ko
            crossDomain: true,
            success : function(qualificationResult) {
                qualificationResult.status="";
                callback(null, sendResultRANAddressAndGeolocation(qualificationResult));
            },
            error : function(xhr, textStatus, errorThrown ) {
                this.tryCount++;
                if (this.tryCount <= this.retryLimit) {
                    // try again with exponential backoff
                    var that=this;
                    setTimeout(function() {
                        $.ajax(that);
                    }, ( (this.tryCount * 600) + Math.floor(Math.random() * 100)) );
                }
                else {
                    // après 5 essais infructeux
                    callback(result.status,sendResultRANAddressAndGeolocation(result));
                }
            }
        });
    }
}

function callSercaAddressToAddressList(address, callback) {

    address.address_row1 = address.address_row1.trim() || '';
    address.address_row2 = address.address_row2.trim() || '';
    address.address_row3 = address.address_row3.trim() || '';
    address.address_row4 = address.address_row4.trim() || '';
    address.address_row5 = address.address_row5.trim() || '';
    address.address_row6 = address.address_row6.trim() || '';

    // /!\ recherche uniquement pdi, si pas de pdi mais voie uniquement????
    var query = getCORSProxy() + SERCA_DNS + '/services/solr/fulltext?chaineRecherche=' + address.address_row4 + '&typeRecherche=pdi;voie&optionMot=Contient&optionRecherche=AND_OR&optionTri=libelle_voie_numero%20asc&optionFiltre=code_insee=' + address.insee_code + '&idClient=' + SERCA_GEOPTIS_LOGIN + '&passwdClient=' + SERCA_GEOPTIS_PWD + '&nbItems=1000&typeResultat=json';

        $.ajax({
            url: query,
            json: true,
            async: true,
            type : 'GET',
            tryCount : 0,
            retryLimit : 1,
            timeout: 15000, // pose une limite de temps sur les appels, en dessus de ce temps le servce distant est KO, /!\ ce service est très lent
            crossDomain: true,
            success : function(qualificationResult) {
                qualificationResult.status="";
                callback(null, filterRNVPSercaAddressList(qualificationResult));
            },
            error : function(xhr, textStatus, errorThrown ) {
                this.tryCount++;
                if (this.tryCount <= this.retryLimit) {
                   // try again with exponential backoff
                    var that=this;
                    setTimeout(function() {
                        $.ajax(that);
                    }, ( (this.tryCount * 600) + Math.floor(Math.random() * 100)) );
                }
                else {
                    // après retryLimit erreurs
                    var qualificationResult={status:'SERVER_ERROR_SERCA_ADDRESS_LIST'};
                    address.status = qualificationResult.status;
                    callback(qualificationResult.status, filterRNVPSercaAddressList(address));
                }
            }
        });
}

// renvoie les données de serca
function filterRNVPSercaAddressList(qualificationResult) {
    var returnJson = {};

    // renvoi des données
    if ( isExistingField(qualificationResult, "status" )  ) {
        returnJson.status = qualificationResult.status;
    }

    // si le champ rnvp est positionné dans params, le résultat rnvp est ajouté en sortie
    if ( options.params.indexOf("address_to_address_list") >= 0 ) {
        returnJson.address_list = [];
        var addressModel = {
                "address_row3": "",
                "address_row4": "",
                "address_row5": "",
                "address_row6": "",
                "geolocation": {
                    "coordinates":[],
                    "type":""
                }
        };
        var tmpAddress= {};

        if (qualificationResult) {
            if ( isExistingField(qualificationResult, "reponse.adresse" )  ) {
                // l'appel a renvoyé une ou plusieurs adresses
                for (var index in qualificationResult.reponse.adresse) {
                    tmpAddress = JSON.parse(JSON.stringify(addressModel)); // clone json
                    tmpAddress.address_row3 = qualificationResult.reponse.adresse[parseInt(index)].ligne3.libelle;
                    tmpAddress.address_row4 = qualificationResult.reponse.adresse[parseInt(index)].ligne4.libelle;
                    tmpAddress.address_row5 = qualificationResult.reponse.adresse[parseInt(index)].ligne5.libelle;
                    tmpAddress.address_row6 = qualificationResult.reponse.adresse[parseInt(index)].ligne6.libelle;
                    tmpAddress.geolocation.coordinates = [qualificationResult.reponse.adresse[parseInt(index)].longitudeWGS84,qualificationResult.reponse.adresse[parseInt(index)].latitudeWGS84];
                    tmpAddress.geolocation.type = convertgeolocationTypeIdToExplicitLabel(qualificationResult.reponse.adresse[parseInt(index)].typeGeo);
                    returnJson.address_list.push(tmpAddress);
                }
            }
            // ?? faut-il un else?
        }
    }
    return returnJson;
}


function callRNVPSerca(address, callback) {

    address.address_row1 = address.address_row1.trim() || '';
    address.address_row2 = address.address_row2.trim() || '';
    address.address_row3 = address.address_row3.trim() || '';
    address.address_row3 = address.address_row3.trim() || '';
    address.address_row4 = address.address_row4.trim() || '';
    address.address_row5 = address.address_row5.trim() || '';
    address.address_row6 = address.address_row6.trim() || '';

    // /!\ serca utilise nom en ligne1
    var query = getCORSProxy() + SERCA_DNS + '/services/mascadia/legacy/controle?&nom=' + address.address_row1 + '&ligne2=' + address.address_row2 + '&ligne3=' + address.address_row3 + '&ligne4=' + address.address_row4 + '&ligne5=' + address.address_row5 + '&ligne6=' + address.address_row6 + '&idClient=apiqadr&passwdClient=' + SERCA_PWD + '&typeResultat=json';

        $.ajax({
            url: query,
            json: true,
            async: true,
            type : 'GET',
            tryCount : 0,
            retryLimit : 6,
            timeout: 7000, // pose une limite de temps sur les appels, en dessus de ce temps le servce distant est Ko
            crossDomain: true,
            success : function(qualificationResult) {
                qualificationResult.status="";
                callback(null, filterRNVPSerca(qualificationResult));
            },
            error : function(xhr, textStatus, errorThrown ) {
                this.tryCount++;
                if (this.tryCount <= this.retryLimit) {
                   // try again with exponential backoff
                    var that=this;
                    setTimeout(function() {
                        $.ajax(that);
                    }, ( (this.tryCount * 600) + Math.floor(Math.random() * 100)) );
                }
                else {
                    // après 3 erreurs
                    var qualificationResult={status:'SERVER_ERROR_RNVP'};
                    address.status = qualificationResult.status;
                    callback(qualificationResult.status, filterRNVPSerca(address));
                }
            }
        });
}

// renvoie les données de serca
function filterRNVPSerca(qualificationResult) {
    var returnJson = {};

    // renvoi des données
    // si le champ rnvp est positionné dans params, le résultat rnvp est ajouté en sortie
    if ( options.params.indexOf("rnvp") >= 0 ) {
        returnJson.rnvp = {
                "address_row1": "",
                "address_row2": "",
                "address_row3": "",
                "address_row4": "",
                "address_row5": "",
                "address_row6": "",
                "status": "",
                "message": ""
        };
        if (qualificationResult) {
            if ( isExistingField(qualificationResult, "status" )  ) {
                returnJson.rnvp.status = qualificationResult.status;
                if ( qualificationResult.status === 'SERVER_ERROR_RNVP' ) {
                    returnJson.status = 'SERVER_ERROR_RNVP';
                }
            }

            if ( isExistingField(qualificationResult, "adresseRetour.blocAdresse.ligne1.nom" )  ) {
                // on renvoie l'adresse redresée (ou l'adresse originelle si le traitement n'a donné aucun résultat)
                returnJson.rnvp.address_row1 = qualificationResult.adresseRetour.blocAdresse.ligne1.nom;
                returnJson.rnvp.address_row2 = qualificationResult.adresseRetour.blocAdresse.ligne2.value;
                returnJson.rnvp.address_row3 = qualificationResult.adresseRetour.blocAdresse.ligne3.value;
                returnJson.rnvp.address_row4 = qualificationResult.adresseRetour.blocAdresse.ligne4.value;
                returnJson.rnvp.address_row5 = qualificationResult.adresseRetour.blocAdresse.ligne5.value;
                returnJson.rnvp.address_row6 = qualificationResult.adresseRetour.blocAdresse.ligne6.value;
            }
            else {
                returnJson.rnvp.address_row1 = qualificationResult.address_row1;
                returnJson.rnvp.address_row2 = qualificationResult.address_row2;
                returnJson.rnvp.address_row3 = qualificationResult.address_row3;
                returnJson.rnvp.address_row4 = qualificationResult.address_row4;
                returnJson.rnvp.address_row5 = qualificationResult.address_row5;
                returnJson.rnvp.address_row6 = qualificationResult.address_row6;
            }

            if ( isExistingField(qualificationResult, "adresseRetour.codesEtMessages.general.feu" )  ) {
                if ( qualificationResult.adresseRetour.codesEtMessages.general.feu === "-1" ) {
                    returnJson.rnvp.status = "partial_modification";
                    // todo translate codesEtMessages.general.messages
                    returnJson.rnvp.message = qualificationResult.adresseRetour.codesEtMessages.general.messages;
                }
                else if ( qualificationResult.adresseRetour.codesEtMessages.general.feu === "0" ){
                    returnJson.rnvp.status = "ok";
                }
                else {
                    returnJson.rnvp.status = "ko";
                    // todo translate codesEtMessages.general.messages
                    returnJson.rnvp.message = qualificationResult.adresseRetour.codesEtMessages.general.messages;
                }
            }
        }
    }
    return returnJson;
}


// renvoie les données de BAN au format json
function formatBaseAdresseNationaleResult(qualificationResult) {

    var returnJson = {
        id: "",
        label: "",
        citycode: "",
        coordinates: [],
        type: "",
        score: "",
        status: ""
    };

    if ( isExistingField(qualificationResult, "features.0.properties.id")) {
        returnJson.id=qualificationResult.features[0].properties.id;
    }

    if ( isExistingField(qualificationResult, "features.0.properties.label")) {
        returnJson.label=qualificationResult.features[0].properties.label;
    }

    if ( isExistingField(qualificationResult, "features.0.properties.citycode")) {
        returnJson.citycode=qualificationResult.features[0].properties.citycode;
    }

    if ( isExistingField(qualificationResult, "features.0.geometry.coordinates")) {
        returnJson.coordinates=qualificationResult.features[0].geometry.coordinates;
    }

    if ( isExistingField(qualificationResult, "features.0.properties.type")) {
        returnJson.type=qualificationResult.features[0].properties.type;
    }

    if ( isExistingField(qualificationResult, "features.0.properties.score")) {
        returnJson.score=qualificationResult.features[0].properties.score;
    }

    if ( ! isExistingField(qualificationResult, "features.0.properties")) {
        returnJson.status = "BAN_NO_MATCH";
    }
    else {
        returnJson.status = qualificationResult.status;
    }

    return returnJson;
}


// renvoie les données de RAN et Geolocation au format json
function sendResultRANAddressAndGeolocation(qualificationResult) {

    var returnJson = {};

    // si le champ geolocation est demandé il est ajouté en sortie
    if ( options.params.indexOf("geolocation") >= 0 ) {
        returnJson.geolocation= {
                "coordinates": [],
                "type": ""
        };
    }
    // si le champ address est demandé on renvoi l'adresse du rférentiel
    if ( options.params.indexOf("address_reference") >= 0 ) {
        returnJson.address_reference ={
                "address_row1": "",
                "address_row2": "",
                "address_row3": "",
                "address_row4": "",
                "address_row5": "",
                "address_row6": "",
        };
    }
    // renvoi des données
    // si le champ geolocation est demandé il est ajouté en sortie
    if ( options.params.indexOf("geolocation") >= 0 ) {
        if ( isExistingField(qualificationResult, "reponse.adresse.0.longitudeWGS84")) {
            returnJson.geolocation.coordinates=[qualificationResult.reponse.adresse[0].longitudeWGS84,qualificationResult.reponse.adresse[0].latitudeWGS84];
        }
        if ( isExistingField(qualificationResult, "reponse.adresse.0.typeGeo") ) {
            returnJson.geolocation.type=convertgeolocationTypeIdToExplicitLabel(qualificationResult.reponse.adresse[0].typeGeo);
        }
    }
    if ( options.params.indexOf("address_reference") >= 0 ) {
        if ( isExistingField(qualificationResult, "reponse.adresse.0.ligne3.libelle") ) {
            returnJson.address_reference.address_row1='';
            returnJson.address_reference.address_row2='';
            returnJson.address_reference.address_row3=qualificationResult.reponse.adresse[0].ligne3.libelle;
            returnJson.address_reference.address_row4=qualificationResult.reponse.adresse[0].ligne4.libelle;
            returnJson.address_reference.address_row5=qualificationResult.reponse.adresse[0].ligne5.libelle;
            returnJson.address_reference.address_row6=qualificationResult.reponse.adresse[0].ligne6.libelle;
        }
    }

    returnJson.status = qualificationResult.status;

    return returnJson;
}

// Gestion du retour du traitement batch
function handleReturnBatchAnalysis(jqXHR, error) {
    if ( jqXHR.status == "202") {
        // Affichage du panneau de succès
        $("#batch-uid").text(jqXHR.getResponseHeader('Location').split('/').pop());
        displayPanelhideOthers("#file_success");
    }
    else {
        // Affichage d'une erreur
        displayPanelhideOthers("#file_error");

        var error_id;
        error_id = jqXHR.status;
        if ( jqXHR.getResponseHeader('Correlation-Id') ) {
            error_id = error_id + "_" + jqXHR.getResponseHeader('Correlation-Id');
        }
        $("#file_error_message").text("Erreur Serveur " + error_id);
    }
}

// Affiche le panneau courant (transfert en cours, terminé, formulaire,...)
function displayPanelhideOthers(panel) {
    $("#file_transfer").hide();
    $("#formFile").hide();
    $("#file_error").hide();
    $("#file_success").hide();
    $("#file_success_local").hide();
    $(panel).show();
    if (panel ==="#file_success_local" && ( options.params.indexOf("geolocation") >= 0 || options.params.indexOf("ban") >= 0 || options.params.indexOf("address_to_address_list") >= 0 )) {
        $("#fileMap").show();
    }
    else {
        $("#fileMap").hide();
    }
}

// Fonction principale jquery lancée quand tous les js ont été chargés
$(document).ready(function(){

    // Moment librairie pour les affichages de temps restant
    moment.locale('fr');

    // initialisation des paramètres
    if (typeof(Storage) !== "undefined") {
        // Sauvegarde de l'email si le navigateur autorise le localStorage HTML5
        options.notification_email = localStorage.getItem("notification_email");
        $('#notification_email').val(options.notification_email);
    }

    if (options.params !=="") {
        // récupération des valeurs des parametres par défaut
        var params = options.params.split(",");
        for (var param in params) {
            $('#params_' + params[param]).prop("checked", true);
        }
    }

    if (options.cors.parallel !=="") {
        // récupération des valeurs des parametres par défaut
        $('#cors_parallel').val(options.cors.parallel);
    }

    if (options.offline !=="") {
        // récupération des valeurs des parametres par défaut
        var offlineArray = options.offline.split(",");
        for (var id in offlineArray) {
            $('#offline_' + offlineArray[id]).prop("selected", true);
        }
    }

    if (options.field_delimiter_input !=="") {
        // récupération des valeurs des parametres par défaut
        $('#field_delimiter_input').val(options.field_delimiter_input);
    }

    // L'utilisateur demande l'envoi de son traitement
    $("#formFileSubmit").click(function(e){
        e.preventDefault();

        // déplace le focus en haut de formulaire
        scrollToAnchor("formTop");

        // vérification du formulaire
        var formValid= true;

        // Vérification email
        if ( ! validateEmail(options.notification_email) ) {
            formValid= false;
            $('#notification_email_alert').show();
            $('#form_group_notification_email').addClass("has-error");
            $('#form_group_notification_email').removeClass("has-success");
            $('#form_group_file').addClass("has_error");
        }

        // Vérification fichier
       if ( ! validateFileExtensionIsCSV($('input[type=file]').val()) ) {
            formValid= false;
            $('#file_alert').show();
            $('#form_group_file').addClass("has-error");
            $('#form_group_file').removeClass("has-success");
            $('#form_group_file').addClass("has_error");
        }

        // Si le formulaire est valide et le traitement fichier est actif
        // On appele le service POST batch_analysis
        if (formValid && $('#remote_processing').is(':checked') ) {

            // Affiche le panneau de transfert de fichier
            displayPanelhideOthers("#file_transfer");

            //var file = $("#file").serialize();

            // Récupère le fichier pour l'envoyer à l'API
            var data = new FormData();
            jQuery.each(jQuery('#file')[0].files, function(i, file) {
                data.append('data', file);
            });

            var query = generateAPIQADRQueryURL();

            var request = $.ajax({
                async: true,
                crossDomain: true,
                accept:"application/json",
                headers: {},
                processData: false,
                mimeType: "multipart/form-data",
                url: "/address/v1/batch_analysis" + query,
                method: "POST",
                contentType: false,
                data: data,
                dataType: "json"
            }, function(data, statusText, jqXHR) {

                // Affichage du panneau de transfert de fichier
                displayPanelhideOthers("#file_transfer");

            });

            request.done(function(data, statusText, jqXHR) {
                handleReturnBatchAnalysis(jqXHR, error);
            });

            request.fail(function(jqXHR, textStatus, error) {
                handleReturnBatchAnalysis(jqXHR, error);
            });
        }
        else if (formValid && !$('#remote_processing').is(':checked')) {
            // Affiche le panneau de transfert de fichier
            displayPanelhideOthers("#file_transfer");
            retrieveInformationsFromFile(currentFile);
        }
    });

    // Demande de nouveau traitement: on réinitialise le formulaire
    $("#file_success_new").click(function(e){
            e.preventDefault();
            var email = options.notification_email; // conserve la valeur avant le reset
            //$("#formFile")[0].reset();
            $("#file").val("");
            $("#data_format").val("");
            // if (options.params !=="") {
            //     // récupération des valeurs des parametres par défaut
            //     var params = options.params.split(",");
            //     for (var param in params) {
            //         $('#params_' + params[param]).prop("checked", true);
            //     }
            // }
            $('#notification_email').val(email);
            $('#file_alert').hide();
            displayPanelhideOthers("#formFile");
            $('#form_group_notification_email').removeClass("has-error");
            $('#notification_email_alert').hide();
            $('#form_group_file').removeClass("has-error");
            $('#form_group_file').removeClass("has-success");
            $("#data_format_success").hide();
            $("#data_format_alert").hide();
    });

    // Demande de nouveau traitement: on réinitialise le formulaire
    // TODO factoriser avec le point avant
    $("#file_success_new2").click(function(e){
            e.preventDefault();
            var email = options.notification_email; // conserve la valeur avant le reset
            ////$("#formFile")[0].reset();
            $("#data_format").val("");
            $("#file").val("");
            // if (options.params !=="") {
            //     // récupération des valeurs des parametres par défaut
            //     var params = options.params.split(",");
            //     for (var param in params) {
            //         $('#params_' + params[param]).prop("checked", true);
            //     }
            // }
            $('#notification_email').val(email);
            $('#file_alert').hide();
            displayPanelhideOthers("#formFile");
            $('#form_group_notification_email').removeClass("has-error");
            $('#notification_email_alert').hide();
            $('#form_group_file').removeClass("has-error");
            $('#form_group_file').removeClass("has-success");
            $("#data_format_success").hide();
            $("#data_format_alert").hide();
            $("#mapSection").hide();
    });

    // Demande de nouveau traitement sur erreur :
    // on laisse les anciennes valeurs pour que l'utilisateur n'ait pas à les resaisir
    $("#file_error_new").click(function(e){
            e.preventDefault();
            displayPanelhideOthers("#formFile");
    });


    // vérifie que l'extnsion du fichier est bien CSV
    $('#file').bind('change', function() {

        if ( validateFileExtensionIsCSV($('input[type=file]').val()) ) {
            $('#file_alert').hide();
            $('#form_group_file').removeClass("has-error");
            $('#form_group_file').addClass("has-success");
        }
        else {
            $('#file_alert').show();
            $('#form_group_file').addClass("has-error");
            $('#form_group_file').removeClass("has-success");
            $('#form_group_file').addClass("has_error");
        }
    });

    // On masque le message indiqaunt que le format de fichier a été identifié si l'utilisateur choisit un autre format
     $("input[name='data_format_type']").bind('click', function() {
        $("#data_format_alert").hide();
        $("#data_format_success").hide();
     });

    // On déplie les explications détaillées sur click sur le libelle
    $("#information_description_unfold").click(function(){
        $('#information_description').toggle();
        if ($('#information_description').is(":hidden")) {
            $('#information_description_icon').removeClass("fa-minus-square");
            $('#information_description_icon').addClass("fa-plus-square");
        }
        else {
            $('#information_description_icon').removeClass("fa-plus-square");
            $('#information_description_icon').addClass("fa-minus-square");
        }
    });

    // Si le traitement distant est désactivé le bouton sauvegarder est affiché : à voir si utile
    $("#remote_processing").click(function(){

        if ( $('#remote_processing').is(':checked') ) {
            $('#file_transfer_state').hide();
            $('#params_rnvp').prop("checked", false);
            $('#params_geolocation').prop("checked", false);
            $('#params_address_reference').prop("checked", false);
            $('#params_ban').prop("checked", false);
            $('#params_address_to_address_list').prop("checked", false);
            // $('#params_rnvp').prop('disabled', 'disabled');
            // $('#params_rnvp_label').addClass('disabled');
            // $('#params_geolocation').prop('disabled', 'disabled');
            // $('#params_geolocation_label').addClass('disabled');
            // $('#params_address_reference').prop('disabled', 'disabled');
            // $('#params_address_reference_label').addClass('disabled');
            // $('#params_ban').prop('disabled', 'disabled');
            // $('#params_ban_label').addClass('disabled');
        }
        else {
            $('#file_transfer_state').show();
            //$('#params_rnvp').prop("checked", true);
            //$('#params_geolocation').prop("checked", true);
            //$('#params_address_reference').prop("checked", true);
            //$('#params_ban').prop("checked", true);
            // $('#params_rnvp').prop('disabled', false);
            // $('#params_rnvp_label').removeClass('disabled');
            // $('#params_geolocation').prop('disabled', false);
            // $('#params_geolocation_label').removeClass('disabled');
            // $('#params_address_reference').prop('disabled', false);
            // $('#params_address_reference_label').removeClass('disabled');
            // $('#params_ban').prop('disabled', false);
            // $('#params_ban_label').removeClass('disabled');
        }
    });

    // Vérification du format notification_email sur perte de focus
    $('#notification_email').bind('focusout', function() {

        if ( validateEmail($("#notification_email").val()) ) {
            if (typeof(Storage) !== "undefined") {
                // Sauvegarde de l'email si le navigateur autorise le localStorage HTML5
                localStorage.setItem("notification_email", $("#notification_email").val());
            }
            $('#notification_email_alert').hide();
            $('#form_group_notification_email').removeClass("has-error");
            $('#form_group_notification_email').addClass("has-success");
        }
        else {
            $('#notification_email_alert').show();
            $('#form_group_notification_email').addClass("has-error");
            $('#form_group_notification_email').removeClass("has-success");
            $('#form_group_file').addClass("has_error");
        }
    });

    // Vérification du format notification_email à chaque keypress
    var oldValue_notification_email = $( "#notification_email" ).val();
    $('#notification_email').on('keydown',function(e) {

        if ( !validateEmail(oldValue_notification_email) && validateEmail( $( "#notification_email" ).val() + e.key ) && oldValue_notification_email!=="" ) {
            $('#notification_email_alert').hide();
            $('#form_group_notification_email').removeClass("has-error");
            $('#form_group_notification_email').addClass("has-success");
        }
        oldValue_notification_email = $(this).val();
    });

    // Sauvegarde le fichier sur le poste client avec une gestion d'accents
    // TODO  l'échappement d'accents ne marche pas avec IE
    $("#fileSaver").click(function(){
        saveFileWithDownload();
    });

    // Sauvegarde le fichier partiel sur le poste client avec une gestion d'accents
    // TODO  l'échappement d'accents ne marche pas avec IE
    $("#fileSaverPartial").click(function(){
        // use FileSaver to export file
        saveFileWithDownload();
    });

    var map = L.map('map').setView([46.85, 2.3518], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // update the map with new marker color
    updateMap = function updateMap(selectedMarker) {

        var idColor = 0;
        var tableColorReference = ['#f0a30a','#825a2c','#0050ef','#a20025','#1ba1e2','#d80073','#a4c400','#6a00ff','#60a917','#008a00','#76608a','#6d8764','#fa6800','#f472d0','#e51400','#7a3b3f','#647687','#00aba9','#aa00ff','#d8c100','#a3c300','#5fa916','#008800','#01abaa','#1a9fe0','#014fef','#6900fd','#a900fd','#f372cf','#d60072','#a20025','#e51400','#f96700','#f0a20a','#e3c900','#82592b','#6c8663','#647587','#755e88','#85784c']; // Couleurs utilisées pour les markers
        var tableColor = [];
        var tmpSelectedMarker= ''; // Nom du marqueur à choisr dans ceux disponibles si pas de valeur par défaut

        // récupère les données au format geoJson
        var geoJsonData = convertCSVToGeoJSONOutputFormat(fileResult);

        // Ajout de propriétés pour afficher sur la carte des marqueurs de différentes couleur en fonction des valeurs
        // et permettre le masquage/affichage au survol du marqueur
        // change map-selector-items to match all properties
        var mapSelectorItems = '';
        for ( var propertie in geoJsonData.features[0].properties ) {
            mapSelectorItems+= '<li><a class="map-selector-item  cursor_pointer" onclick="mapChangeMarker(\'' + propertie + '\');return(false);">' + propertie + '</a></li>';
            if ( selectedMarker === "" && propertie === "distribution_site.id" ) {
                tmpSelectedMarker = propertie;
            }
        }
        if ( tmpSelectedMarker === "") {
            tmpSelectedMarker = propertie;
        }
        // donne une valeur par défaut au champ à afficher
        if ( selectedMarker === "") {
            selectedMarker = tmpSelectedMarker;
        }
        $("#map-selector-items").html(mapSelectorItems);

        // change main button to match all selectedmarker
        $("#map-selector-button").text(selectedMarker);

        // change map-selector-item to match all markers values
        var mapSelectorMarkers = '';
        for ( var feature in geoJsonData.features ) {
            if (tableColor['colorMarker' + geoJsonData.features[feature].properties[selectedMarker].replace(/\W/g, '_')] === undefined) {
                // affiche un nombre limité de valeurs distinctes pour ne pas surcharger l'affichage
                if (idColor < 40) {
                    tableColor['colorMarker' + geoJsonData.features[feature].properties[selectedMarker].replace(/\W/g, '_')] = tableColorReference[idColor];
                    idColor++;
                    mapSelectorMarkers+= '<li onmouseover="mapHighlightMarker(this);" onmouseout="mapUnHighlightMarker(this);" class="map-selector-marker colorMarker' + geoJsonData.features[feature].properties[selectedMarker].replace(/\W/g, '_') + '  cursor_pointer"><i class="fa fa-circle" style="color:' + tableColor['colorMarker' + geoJsonData.features[feature].properties[selectedMarker].replace(/\W/g, '_')] + '" aria-hidden="true"></i> '+ ( geoJsonData.features[feature].properties[selectedMarker] || "Vide" ) + '</li>';
                }
                else {
                    idColor='';
                    mapSelectorMarkers+= '<li class="map-selector-marker colorMarker"><i class="fa fa-circle" style="color:black" aria-hidden="true"></i> Autres valeurs</li>';
                    break;
                }
            }
        }

        $("#map-selector-markers").html(mapSelectorMarkers);

        // Supprime les anciens points de la carte s'ils existent
        if (geojsonLayer) {geojsonLayer.clearLayers();}

        geojsonLayer = L.geoJson(geoJsonData, {
            style: function(feature) {
                return {
                    color: tableColor['colorMarker' + feature.properties[selectedMarker].replace(/\W/g, '_')],
                    className: 'map-marker colorMarker' + feature.properties[selectedMarker].replace(/\W/g, '_'),
                    onmouseover: 'mapHighlightMarker(this);'
                };
            },
            pointToLayer: function(feature, latlng) {
                return new L.CircleMarker(latlng, {radius: 4, fillOpacity: 0.85});
            },
            onEachFeature: function (feature, layer) {
                 var popupContent = '';
                 for (var propertie in feature.properties) {
                    popupContent+= propertie + ': <b>' + feature.properties[propertie] + '</b></br>';
                 }
                 layer.bindPopup(popupContent, {minWidth: 500, maxHeight: 160, autoPan: true, closeButton: true, autoPanPadding: [5, 5]});
            }
        });

        // Ajout des données à la carte
        map.addLayer(geojsonLayer);

        // BUG https://github.com/Leaflet/Leaflet/issues/941
        setTimeout(function(){ map.invalidateSize(); }, 400);
        setTimeout(function(){ map.fitBounds(geojsonLayer.getBounds()); }, 1000);
    };


    $("#fileMap").click(function(e){
        updateMap("");
        $("#mapSection").show();
        // déplace le focus vers la carte
        scrollToAnchor("mapLink");
    });

    $("#offline").change(function() {
        if ( $("#offline").val()) {
            options.offline = $("#offline").val().toString();
        }
        else {
            options.offline="";
        }
});

    $("input[name=params]:checkbox").change(function() {
        options.params = $('input[name=params]:checked').map(function() {return this.value;}).get().join(',');
    });

    // synchronise les options avec l'affichage de type input
    $("#notification_email, #data_format, #exclude, #csv_numeric_format, #my_fields").each(function(){
         $(this).change(function() {
             options[this.id] = this.value;
         });
     });
    // synchronise les options avec l'affichage de type input
    $("#cors_parallel").each(function(){
        $(this).change(function() {
            options.cors.parallel = this.value;
        });
    });

    // Désactive le traitement distant si une option non encore mise en oeuvre est choisie
    $("#params_ban, #params_address_reference, #params_rnvp, #params_geolocation, #params_address_to_address_list").each(function(){
        $(this).change(function() {
            if ( this.checked === true ) {
                $("#remote_processing").prop("checked", false);
            }
        });
    });
    // Désactive le traitement distant si une option non encore mise en oeuvre est choisie
    $(" #params_address_to_address_list").each(function(){
        $(this).change(function() {
            if ( this.checked === true ) {
               $("#params_deliverable").prop("checked", false);
               $("#params_distribution_site").prop("checked", false);
               $("#params_distribution_site_detail").prop("checked", false);
               $("#params_cabin_site").prop("checked", false);
               $("#params_round").prop("checked", false);
               $("#params_address_ids").prop("checked", false);
               $("#params_ban").prop("checked", false);
               $("#params_address_reference").prop("checked", false);
               $("#params_rnvp").prop("checked", false);
               $("#params_geolocation").prop("checked", false);
               options.params = "address_to_address_list";
            }
        });
    });

    // Affiche ou masque les options "expert" sur click sur le libelle "Plus d'options/moins d'options"
    $("#more_options").click(function(e){
        if ( $("#more_options").text().indexOf("Moins d'options") >=0 ) {
            $('#form_group_params').hide();
            $('#form_group_my_fields').hide();
            $('#form_group_data_format').hide();
            $('#form_group_data_format_type').hide();
            // Cache certaines options dans le cas de beta dans l'url
            if (window.location.href.indexOf("beta") >= 0) {
                $('#form_group_remote_processing').hide();
                $('#form_group_offline').hide();
                $('#form_group_cors_parallel').hide();
                $('#form_group_field_delimiter_input').hide();
                $('#params_ban_label').hide();
                $('#params_address_reference_label').hide();
                $('#params_address_to_address_list_label').hide();
                $('#params_geolocation_label').hide();
                $('#params_rnvp_label').hide();
            }
            $('#form_group_csv_numeric_format').hide();
            $('#form_group_exclude').hide();

            $("#more_options").html("Plus d'options <i class='fa fa-caret-right' id='more_options_icon'></i>");

            // déplace le focus en haut de formulaire
            scrollToAnchor("formTop");
        }
        else {
            $('#form_group_params').show();
            // désactivé tant que non développé : $('#form_group_my_fields').show();
            $('#form_group_data_format').show();
            $('#form_group_data_format_type').show();
            // Affiche certaines options dans le cas de beta dans l'url
            if (window.location.href.indexOf("beta") >= 0) {
                $('#form_group_remote_processing').show();
                $('#form_group_offline').show();
                $('#form_group_cors_parallel').show();
                $('#form_group_field_delimiter_input').show();
                $('#params_ban_label').show();
                $('#params_address_reference_label').show();
                $('#params_address_to_address_list_label').show();
                $('#params_geolocation_label').show();
                $('#params_rnvp_label').show();
            }
            $('#form_group_csv_numeric_format').show();
            $('#form_group_exclude').show();
            $("#more_options").html("Moins d'options <i class='fa fa-caret-up' id='more_options_icon'></i>");
        }
    });
});