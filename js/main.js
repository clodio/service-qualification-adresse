function hoverPresentation(element) {
    element.setAttribute('src', 'img/presentation_service_hover.png');
}
function unhoverPresentation(element) {
    element.setAttribute('src', 'img/presentation_service.png');
}


$(document).ready(function(){
    $("#formFileSubmit").click(function(e){
        e.preventDefault();
    
        // TODO : Add control (email mandatory, file-type .csv)
        var file = $("#file").serialize();

        // Récupère le fichier pour l'envoyer à l'API
        var data = new FormData();
        jQuery.each(jQuery('#file')[0].files, function(i, file) {
            data.append('data', file);
        });

        // Affiche le panneau de transfert de fichier
        $("#file_transfer").show();
        $("#formFile").hide();

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
            url: "http://ws-apiqa-sdev.apps.paas.dev.net-courrier.extra.laposte.fr" +  "/address/v1/batch_analysis" + query,
            method: "POST",
            contentType: false,
            data: data,
            dataType: "json"
        }, function(data, statusText, jqXHR) {
            // Affichage du panneau de transfert de fichier
            $("#file_transfer").show();
            $("#formFile").hide();
            $("#file_error").hide();
            $("#file_success").hide();
        });
        
        request.done(function(data, statusText, jqXHR) {
            if ( jqXHR.status == "202") {
                // Affichage du panneau de succès
                $("#batch-uid").val(jqXHR.getResponseHeader('Location').split('/').pop());
                $("#file_error").hide();
                $("#file_success").show();
            }
            else {
                // Ce cas ne devrait pas arriver
                // Affichage d'une erreur
                $("#file_error").show();
                $("#file_success").hide();
                var error_id;
                error_id = jqXHR.status 
                if ( jqXHR.getResponseHeader('Correlation-Id') ) {
                    error_id = error_id + "_" + jqXHR.getResponseHeader('Correlation-Id');
                }
                $("#file_error_message").text("Erreur Serveur " + error_id);
            }
            $("#file_transfer").hide();
            $("#formFile").hide();
        });
        
        request.fail(function(jqXHR, textStatus, error) {
            if ( jqXHR.status == "202") {
                // Code présent du fait d'un bug jquery 
                // Dans le cas de code 202 avec body vide jquery considère que c'est une erreur
                $("#batch-uid").val(jqXHR.getResponseHeader('Location').split('/').pop());
                $("#file_error").hide();
                $("#file_success").show();
            }
            else {
                // Affichage d'une erreur
                // TODO : afficher un numéro d'erreur plus pertinent
                $("#file_error").show();
                $("#file_success").hide();
                var error_id;
                error_id = jqXHR.status 
                if ( jqXHR.getResponseHeader('Correlation-Id') ) {
                    error_id = error_id + "_" + jqXHR.getResponseHeader('Correlation-Id');
                }
                $("#file_error_message").text("Erreur Serveur " + error_id);
            }
            $("#file_transfer").hide();
            $("#formFile").hide();
        });
    });

    $("#file_success_new").click(function(e){
            e.preventDefault();
            $("#formFile")[0].reset();
            $("#file_transfer").hide();
            $("#formFile").show();
            $("#file_error").hide();
            $("#file_success").hide();    
    });
    $("#file_error_new").click(function(e){
            e.preventDefault();
            $("#file_transfer").hide();
            $("#formFile").show();
            $("#file_error").hide();
            $("#file_success").hide();    
    });
});
