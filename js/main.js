function hoverPresentation(element) {
    element.setAttribute('src', 'img/presentation_service_hover.png');
}

function unhoverPresentation(element) {
    element.setAttribute('src', 'img/presentation_service.png');
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

function displayPanelhideOthers(panel) {
    $("#file_transfer").hide();
    $("#formFile").hide();
    $("#file_error").hide();
    $("#file_success").hide();
    $(panel).show();
}

$(document).ready(function(){
    $("#formFileSubmit").click(function(e){
        e.preventDefault();

        // vérification du formulaire
        var formValid= true;

        // Vérification email
        if ( ! validateEmail($("#notification_email").val()) ) {
            formValid= false;
            $('#notification_email_alert').show();
            $('#form_group_notification_email').addClass("has-error");
            $('#form_group_notification_email').removeClass("has-success")
            $('#form_group_file').addClass("has_error");
        }

        // Vérification fichier
       if ( ! validateFileExtensionIsCSV($('input[type=file]').val()) ) {
            formValid= false;
            $('#file_alert').show();
            $('#form_group_file').addClass("has-error");
            $('#form_group_file').removeClass("has-success")
            $('#form_group_file').addClass("has_error");
        }
        
        if (formValid) {

            // Affiche le panneau de transfert de fichier
            displayPanelhideOthers("#file_transfer");

            var file = $("#file").serialize();

            // Récupère le fichier pour l'envoyer à l'API
            var data = new FormData();
            jQuery.each(jQuery('#file')[0].files, function(i, file) {
                data.append('data', file);
            });

            var query = "?params=" + $("#params").val().toString() + "&notification_email=" + $("#notification_email").val() + "&csv_numeric_format=" + $("#csv_numeric_format").val() + "&my_fields=" + $("#my_fields").val();

            // Ajout du parametre data_format si non vide
            if ( $('input[name=data_format]:checked', '#formFile').val().toString() !="" ){
                query= query + "&data_format=" + $('input[name=data_format]:checked', '#formFile').val().toString();
            }

            var request = $.ajax({
                async: true,
                crossDomain: true,
                accept:"application/json",
                headers: {},
                processData: false,
                mimeType: "multipart/form-data",
                url: "" +  "/address/v1/batch_analysis" + query,
                method: "POST",
                contentType: false,
                data: data,
                dataType: "json"
            }, function(data, statusText, jqXHR) {

                // Affichage du panneau de transfert de fichier
                displayPanelhideOthers("#file_transfer");

            });
            
            request.done(function(data, statusText, jqXHR) {
                if ( jqXHR.status == "202") {
                    // Affichage du panneau de succès
                    $("#batch-uid").text(jqXHR.getResponseHeader('Location').split('/').pop());
                    displayPanelhideOthers("#file_success");
                }
                else {
                    // Ce cas ne devrait pas arriver
                    // Affichage d'une erreur
                    displayPanelhideOthers("#file_error");

                    var error_id;
                    error_id = jqXHR.status 
                    if ( jqXHR.getResponseHeader('Correlation-Id') ) {
                        error_id = error_id + "_" + jqXHR.getResponseHeader('Correlation-Id');
                    }
                    $("#file_error_message").text("Erreur Serveur " + error_id);
                }

            });
            
            request.fail(function(jqXHR, textStatus, error) {
                if ( jqXHR.status == "202") {
                    // Code présent du fait d'un bug jquery 
                    // Dans le cas de code 202 avec body vide jquery considère que c'est une erreur
                    $("#batch-uid").text(jqXHR.getResponseHeader('Location').split('/').pop());
                    displayPanelhideOthers("#file_success");
                }
                else {
                    // Affichage d'une erreur
                    displayPanelhideOthers("#file_error");

                    var error_id;
                    error_id = jqXHR.status 
                    if ( jqXHR.getResponseHeader('Correlation-Id') ) {
                        // TODO : afficher un numéro d'erreur plus pertinent
                        error_id = error_id + "_" + jqXHR.getResponseHeader('Correlation-Id');
                    }
                    $("#file_error_message").text("Erreur Serveur " + error_id);
                }
            });
        }
    });

    // Demande de nouveau traitement: on réinitialise le formulaire
    $("#file_success_new").click(function(e){
            e.preventDefault();
            $("#formFile")[0].reset();
            $('#file_alert').hide();
            displayPanelhideOthers("#formFile");
            $('#form_group_notification_email').removeClass("has-error");
            $('#form_group_notification_email').removeClass("has-success");
            $('#notification_email_alert').hide();
            $('#form_group_file').removeClass("has-error");
            $('#form_group_file').removeClass("has-success");
    });

    // Demande de nouveau traitement sur erreur : on laisse les anciennes valeurs
    $("#file_error_new").click(function(e){
            e.preventDefault();
            displayPanelhideOthers("#formFile");
    });


    // vérification file Extension CSV
    $('#file').bind('change', function() {

        if ( validateFileExtensionIsCSV($('input[type=file]').val()) ) {
            $('#file_alert').hide();
            $('#form_group_file').removeClass("has-error");
            $('#form_group_file').addClass("has-success")
        }
        else {
            $('#file_alert').show();
            $('#form_group_file').addClass("has-error");
            $('#form_group_file').removeClass("has-success")
            $('#form_group_file').addClass("has_error");
        }
    });



    // On déplie les explication détaillées
    $("#information_description_deplier").click(function(e){
             $('#information_description').toggle();
    });

    // Vérification notification_email sur perte de focus
    $('#notification_email').bind('focusout', function() {

        if ( validateEmail($("#notification_email").val()) ) {
            $('#notification_email_alert').hide();
            $('#form_group_notification_email').removeClass("has-error");
            $('#form_group_notification_email').addClass("has-success")
        }
        else {
            $('#notification_email_alert').show();
            $('#form_group_notification_email').addClass("has-error");
            $('#form_group_notification_email').removeClass("has-success")
            $('#form_group_file').addClass("has_error");
        }
    });

    // Vérification notification_email à chaque keypress
    var oldValue_notification_email = $( "#notification_email" ).val();
    $('#notification_email').on('keydown',function(e) {

        if ( !validateEmail(oldValue_notification_email) && validateEmail( $( "#notification_email" ).val() + e.key ) && oldValue_notification_email!="" ) {
            $('#notification_email_alert').hide();
            $('#form_group_notification_email').removeClass("has-error");
            $('#form_group_notification_email').addClass("has-success");
        }
        oldValue_notification_email = $(this).val();   
    });

});
