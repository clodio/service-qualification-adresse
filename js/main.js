function hoverPresentation(element) {
    element.setAttribute('src', '/img/presentation_service_hover.png');
}
function unhoverPresentation(element) {
    element.setAttribute('src', '/img/presentation_service.png');
}


$(document).ready(function(){
    $("#formFileSubmit").click(function(e){
        e.preventDefault();
    
    // TODO : Add control (email mandatory, file-type .csv)
    var file = $("#file").serialize();
    var data = new FormData();
    jQuery.each(jQuery('#file')[0].files, function(i, file) {
        data.append('data', file);
    });

    $("#file_transfer").show();
    $("#formFile").hide();

    var query = "?params=" + $("#params").val().toString() + 
    "&data_format=" + $('input[name=data_format]:checked', '#formFile').val().toString() + "&notification_email=" + $("#notification_email").val() + "&csv_numeric_format=" + $("#csv_numeric_format").val() + "&my_fields=" + $("#my_fields").val();
    var request = $.ajax({
        async: true,
        crossDomain: true,
        accept:"application/json",
        headers: {},
        processData: false,
        mimeType: "multipart/form-data",
        url: "/address/v1/batch_analysis" + query,
        method: "POST",
        contentType : "multipart/form-data",
        data: data,
        dataType: "json"
    }, function(data, statusText, jqXHR) {
        alert( "success" );
        $("#file_transfer").show();
        $("#formFile").hide();
        $("#file_error").hide();
        $("#file_success").hide();
    });
    
    request.done(function(data, statusText, jqXHR) {
        alert( "second success" );
        $("#file_transfer").hide();
        $("#formFile").hide();
        $("#file_error").hide();
        $("#file_success").show();
        $("#batch-uid").val("todo");
    });
    
    request.fail(function(jqXHR, textStatus) {
        console.log(jqXHR);
        $("#file_transfer").hide();
        $("#formFile").hide();
        $("#file_error").show();
        $("#file_success").hide();
    });

    request.always(function() {
        // alert( "finished" );
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

